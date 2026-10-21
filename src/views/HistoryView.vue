<script setup lang="ts">
// History: every change a person made to this workspace's setup, whichever way it
// was made, in one list, newest first. Each service keeps its own history; this
// screen reads them and keeps no copy. Nothing on a line can be changed.
//
// What is ticked and whose lines are shown live in the address, so a link, a
// refresh and Back keep them. Only a ticked area is read, and a person chosen is
// asked of each service, so an act of months ago is found.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { DayList, PageHeader, StateBlock, type DayGroup, type DayLine } from 'uibyte'

import { labelOf, permissionName } from '../lib/boxes'
import {
  merge,
  namesFromLines,
  registerWords,
  transportWords,
  withoutPairedAdministratorLines,
  type Names,
  type Placed,
  type Stream,
  type Worded,
} from '../lib/history'
import { useLexicon } from '../lexicon'
import { useAdminOptions, type HistoryLine, type HistoryNames, type LineWords } from '../options'
import { REGISTER_FILTER, useHistory } from '../stores/history'
import { usePeople } from '../stores/people'
import { useAdminSession } from '../stores/session'

/** What `who` holds for the lines of whoever runs the deployment. */
const OPERATOR = 'operator'

const { t, te, locale } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const people = usePeople()
const history = useHistory()
const lexicon = useLexicon()
const route = useRoute()
const router = useRouter()
const w = (key: string) => `configbyte.history.${key}`
/** The page the address belongs to: nothing is written to another page's. */
const here = route.path

const register = computed(() => (options.register && session.order.includes(options.register) ? options.register : undefined))
const sources = computed(() => (options.history?.sources ?? []).filter((s) => session.order.includes(s.section) && !s.locked?.()))

/** The areas that can be ticked, each shown only for a service that answered the coordinator's start check. */
const filters = computed(() => {
  const host = (options.history?.filters ?? [])
    .filter((f) => sources.value.some((s) => s.filter === f.key))
    .map((f) => ({ key: f.key, label: t(f.word) }))
  if (!register.value) return host
  const own = { key: REGISTER_FILTER, label: t(w('filters.people')) }

  return [...host.slice(0, 1), own, ...host.slice(1)]
})
const areas = computed(() => filters.value.map((f) => f.key))
const areaWord = computed(() => new Map(filters.value.map((f) => [f.key, f.label])))

// The address: `show` the ticked areas (absent when all are), `who` a member's id, a person's key
// (`sub:…`, the way the services name them) or `operator`.
const first = (value: unknown) => String((Array.isArray(value) ? value[0] : value) ?? '')
const asked = computed(() => first(route.query.show).split(',').filter((k) => areas.value.includes(k)))
/** An address naming none of the areas on screen means all of them. */
const tickedKeys = computed(() => (asked.value.length ? areas.value.filter((k) => asked.value.includes(k)) : areas.value))
const whoParam = computed(() => first(route.query.who))

const person = computed(() =>
  whoParam.value && whoParam.value !== OPERATOR ? people.people.find((m) => m.id === whoParam.value || m.subjectKey === whoParam.value) : undefined,
)
/** What the Who choice shows as chosen: the member's id when the address gave their key, since the choices are the members. */
const whoShown = computed(() => person.value?.id ?? whoParam.value)
/** The key the services are asked for: a person's, `operator`, or none for everyone. */
const actor = computed(() => (whoParam.value === OPERATOR ? OPERATOR : (person.value?.subjectKey ?? '')))
/** Whether the people list has been answered, one way or the other. */
const peopleKnown = computed(() => !register.value || !session.me || people.loaded || people.failed !== '')
/** A person named in the address cannot be asked for before the list says who they are. */
const ready = computed(() => !whoParam.value || whoParam.value === OPERATOR || peopleKnown.value)

function write(next: { show?: string[]; who?: string }) {
  if (route.path !== here) return
  const show = next.show ?? tickedKeys.value
  const who = next.who ?? whoParam.value
  const query = { ...route.query }
  delete query.show
  delete query.who
  if (show.length < areas.value.length) query.show = show.join(',')
  if (who) query.who = who
  void router.replace({ query })
}

/** The last ticked area stays ticked: an address cannot say none. */
const onlyOne = computed(() => tickedKeys.value.length === 1)
function tick(key: string, on: boolean) {
  const next = on ? areas.value.filter((k) => k === key || tickedKeys.value.includes(k)) : tickedKeys.value.filter((k) => k !== key)
  if (next.length) write({ show: next })
}

// A person the list does not hold means everyone, and the address says so.
watch(
  [ready, whoParam, person],
  () => {
    if (ready.value && whoParam.value && whoParam.value !== OPERATOR && !person.value) write({ who: '' })
  },
  { immediate: true },
)

const settled = ref(false)
const waiting = computed(() => !settled.value || !peopleKnown.value)

interface Plan {
  shape: string
  actor: string
  ticks: string[]
}
const shape = computed(() => JSON.stringify([register.value ?? '', sources.value.map((s) => [s.section, s.query ?? '', s.filter])]))
const plan = computed(() => (ready.value ? JSON.stringify({ shape: shape.value, actor: actor.value, ticks: tickedKeys.value } satisfies Plan) : ''))

/** Bring what is read to the plan: set the streams up, restart them for another person, read what is newly ticked. */
async function apply(next: string, prev: string | undefined) {
  const to = JSON.parse(next) as Plan
  const from = prev ? (JSON.parse(prev) as Plan) : null
  const same = from && to.shape === from.shape ? from : null
  if (!same) history.open({ register: register.value, sources: sources.value, actor: to.actor })
  else if (to.actor !== same.actor) history.restart(to.actor)
  const turnedOn = same ? to.ticks.filter((k) => !same.ticks.includes(k)) : to.ticks
  const prepare = options.history?.prepare
  const prepared = turnedOn.length && prepare ? Promise.resolve().then(() => prepare(turnedOn)).catch(() => undefined) : undefined
  await Promise.all([prepared, history.ensure((s) => to.ticks.includes(s.filter))])
  settled.value = true
}
watch(plan, (next, prev) => void (next && apply(next, prev)), { immediate: true })

onMounted(() => {
  // Read again for another workspace: a sign-in can end and another begin without the page loading again.
  if (!register.value || !session.me) return
  if (!people.loaded || people.tenant !== session.me.tenant) {
    void people.load({ section: register.value, tenant: session.me.tenant, fields: options.roles?.fields })
  } else {
    // The lists were read for another screen, which may not have needed the chart or the restricted fields.
    void people.ensurePositions()
    void people.ensureFields(options.roles?.fields)
  }
})

const isShown = (s: Stream) => tickedKeys.value.includes(s.filter) && !s.failed

/** Names the register keeps, and names learnt from earlier lines for what was since deleted. */
const learnt = computed(() => namesFromLines(history.streams.flatMap((s) => s.lines)))
const boxWords = computed(() => {
  const words = new Map<string, string>()
  for (const s of people.services) for (const p of s.permissions) words.set(permissionName(s.key, p), labelOf(p, locale.value))
  for (const f of people.fields ?? []) words.set(f.permission, t('configbyte.people.roles.fieldBox', { field: f.name }))

  return words
})
/** A host's word for a key a line carries: only a word the host gave, never something every object has. */
const ownWord = (words: Record<string, string> | undefined, key: string): string =>
  words && Object.prototype.hasOwnProperty.call(words, key) && typeof words[key] === 'string' ? words[key]! : ''
/** A member by the name a reader knows it by: a service in the host's words where it gives some, else as the register holds it. */
function memberName(m: { subjectKey: string; displayName: string; kind?: string }): string {
  const word = m.kind === 'service' ? ownWord(options.history?.services, m.subjectKey) : ''

  return word ? t(word) : m.displayName
}

const names: Names = {
  member: (id) => {
    const m = people.byId(id)

    return m ? memberName(m) : ''
  },
  role: (id) => people.roles.find((r) => r.id === id)?.name ?? '',
  type: (id) => people.userTypes.find((u) => u.id === id)?.name ?? learnt.value.types.get(id) ?? '',
  position: (id) => people.positions.find((p) => p.id === id)?.name ?? learnt.value.positions.get(id) ?? '',
  box: (permission) => {
    const word = ownWord(options.history?.boxes, permission)

    return word ? t(word) : (boxWords.value.get(permission) ?? t(w('lines.boxUnnamed')))
  },
  entitlement: (service, feature) => {
    const given = options.history?.entitlements
    const word = (feature && ownWord(given, `${service}/${feature}`)) || ownWord(given, service)

    return word ? t(word) : (people.services.find((s) => s.key === service)?.displayName ?? '')
  },
  service: (key) => {
    if (!key) return ''
    if (key === options.register) return lexicon.value.titles[key] ?? ''
    const word = ownWord(options.history?.services, key)

    return word ? t(word) : (people.services.find((s) => s.key === key)?.displayName ?? '')
  },
  grant: (group, level) => {
    const word = ownWord(options.history?.grants, `${group}/${level}`)
    if (word) return t(word)
    // The register's own ladder is named by these screens.
    const own = w(`levels.${group}.${level}`)

    return te(own) ? t(own) : ''
  },
  isService: (id) => people.byId(id)?.kind === 'service',
}

/** The names the host's sentences may use, from the lists this screen already holds. */
const hostNames: HistoryNames = { member: (subjectKey) => people.bySubject(subjectKey)?.displayName ?? '' }

interface Drawn {
  id: string
  line: HistoryLine
  day: string
  time: string
  /** The key of whoever the line begins with: a member's, `operator`, or empty for someone the list does not hold. */
  begins: string
  whoName: string
  words: LineWords | null
  kind: string
  detail?: LineWords
  area: string
  /** Set for a line about a service the workspace runs on. */
  service?: { id: string; name: string }
}

/** A day as a heading: its year only when it is not this year's. */
const dayFormat = computed(() => {
  const thisYear = new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long' })
  const anyYear = new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', year: 'numeric' })
  const year = new Date().getFullYear()

  return { format: (when: Date) => (when.getFullYear() === year ? thisYear : anyYear).format(when) }
})
const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))

/** Who a line begins with: a member by name, whoever runs the deployment, or someone the list does not hold. */
function beginsWith(worded: Worded | null, line: HistoryLine): { key: string; name: string } {
  if (worded?.who.member) {
    const m = people.byId(worded.who.member)

    return m ? { key: m.subjectKey, name: memberName(m) } : { key: '', name: t(w('notInList')) }
  }
  const actorKey = worded?.who.actor ?? line.actor
  const m = people.bySubject(actorKey)
  if (m) return { key: m.subjectKey, name: memberName(m) }
  // An actor that is not a typed key is a tool or the deployment itself.
  if (!/^(sub|svc):/.test(actorKey)) return { key: OPERATOR, name: t(w('operator')) }

  return { key: '', name: t(w('notInList')) }
}

function draw(p: Placed): Drawn {
  const line = p.line
  const inRegister = p.stream.key === 'register'
  let worded: Worded | null
  if (inRegister) worded = registerWords(line, names)
  else {
    worded = transportWords(line)
    const hostWords = worded ? null : (options.history?.describe?.(line, hostNames) ?? null)
    if (hostWords) worded = { who: { actor: line.actor }, words: hostWords }
  }
  const begins = beginsWith(worded, line)
  const when = new Date(p.when)
  const member = line.userId ? people.byId(line.userId) : undefined
  const subject = typeof line.payload?.subjectKey === 'string' ? line.payload.subjectKey : ''
  const about = inRegister && (member ? member.kind === 'service' : subject.startsWith('svc:'))

  return {
    id: `${p.stream.key}:${line.id}`,
    line,
    day: dayFormat.value.format(when),
    time: timeFormat.value.format(when),
    begins: begins.key,
    whoName: begins.name,
    words: worded?.words ?? null,
    kind: line.kind,
    ...(worded?.detail ? { detail: worded.detail } : {}),
    area: areaWord.value.get(p.stream.filter) ?? '',
    ...(about ? { service: { id: line.userId || subject, name: member ? memberName(member) : '' } } : {}),
  }
}

const merged = computed(() => merge(history.streams.filter(isShown)))
// A service is no newcomer: the user type every arrival receives is not drawn for one.
const drawn = computed(() =>
  merged.value.lines.map(draw).filter((d) => !(d.service && d.kind === 'userTypeAssigned' && d.line.payload?.source === 'workspaceDefault')),
)
/** A person's lines are the lines that begin with their name. */
const begun = computed(() => drawn.value.filter((d) => !actor.value || d.begins === actor.value))
const lines = computed(() => withoutPairedAdministratorLines(begun.value))

/** A run of lines about the services the workspace runs on, drawn as one. */
interface Fold {
  key: string
  time: string
  run: Drawn[]
  names: string
  count: number
}
const opened = reactive(new Set<string>())

const shown = computed(() => {
  const groups: DayGroup[] = []
  const lineOf = new Map<string, Drawn>()
  const foldOf = new Map<string, Fold>()
  const plain = (d: Drawn, marked: boolean): DayLine => {
    lineOf.set(d.id, d)

    return { key: d.id, time: d.time, where: d.area, marked }
  }
  let group: DayGroup | undefined
  let i = 0
  while (i < lines.value.length) {
    const d = lines.value[i]!
    if (!group || group.heading !== d.day) {
      group = { key: d.day, heading: d.day, lines: [] }
      groups.push(group)
    }
    let end = i
    if (d.service) {
      while (end + 1 < lines.value.length && lines.value[end + 1]!.service && lines.value[end + 1]!.day === d.day) end += 1
    }
    const run = lines.value.slice(i, end + 1)
    if (run.length < 2) {
      group.lines.push(plain(d, false))
    } else {
      const key = `fold:${d.id}`
      const services = new Set(run.map((r) => r.service!.id || r.service!.name))
      const named = [...new Set(run.map((r) => r.service!.name).filter(Boolean))]
      foldOf.set(key, { key, time: d.time, run, names: named.join(', '), count: Math.max(services.size, 1) })
      group.lines.push({ key, time: d.time, marked: true })
      if (opened.has(key)) for (const r of run) group.lines.push(plain(r, true))
    }
    i = end + 1
  }

  return { groups, lineOf, foldOf }
})
/** One-item lists for the line slot: the slot draws whichever of the two its line is. */
const asLine = (key: string) => [shown.value.lineOf.get(key)].filter((d): d is Drawn => !!d)
const asFold = (key: string) => [shown.value.foldOf.get(key)].filter((f): f is Fold => !!f)

function toggle(key: string) {
  if (opened.has(key)) opened.delete(key)
  else opened.add(key)
}

const narrowed = computed(() => whoParam.value !== '' || tickedKeys.value.length < areas.value.length)

/** The words for a refusal that came with none: what its status says. */
function statusWords(status: number): string {
  if (status === 401 || status === 403) return t(w('status.forbidden'))
  if (status === 404) return t(w('status.notFound'))
  if (status >= 500 || status === 0) return t(w('status.failed'))

  return t(w('status.other'), { status })
}

/** An area whose lines could not be read, said once each, in the area's word. */
const missing = computed(() => {
  const out: string[] = []
  for (const key of tickedKeys.value) {
    const failing = history.streams.filter((s) => s.filter === key && s.failed)
    if (!failing.length) continue
    const area = areaWord.value.get(key) ?? key
    const refused = failing.find((s) => s.failed === 'refused')
    if (failing.some((s) => s.failed === 'unanswered') || !refused) out.push(t(w('notAnswering'), { area }))
    else out.push(t(w('unread'), { area, reason: refused.reason || statusWords(refused.status) }))
  }

  return out
})

/** Everyone first, then the workspace's people by name, then whoever runs the deployment. */
const whoOptions = computed(() =>
  [...people.people]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, locale.value))
    .map((m) => ({ value: m.id, label: m.displayName })),
)
</script>

<template>
  <section class="@container/page mx-auto max-w-[1040px] px-8 py-8">
    <PageHeader :eyebrow="t('configbyte.frame.shell.workspace')" :title="t(w('title'))" :subtitle="t(w('lead'))" />

    <div class="mb-3 mt-[18px] flex flex-wrap items-center gap-2" data-block="filters">
      <label
        v-for="f in filters"
        :key="f.key"
        class="inline-flex cursor-pointer select-none items-center gap-[7px] rounded-full border bg-surface py-1.5 pl-2.5 pr-[13px] text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus"
        :class="tickedKeys.includes(f.key) ? 'border-ink' : 'border-line'"
      >
        <input
          type="checkbox"
          class="sr-only"
          :checked="tickedKeys.includes(f.key)"
          :disabled="onlyOne && tickedKeys.includes(f.key)"
          :data-filter="f.key"
          @change="tick(f.key, ($event.target as HTMLInputElement).checked)"
        />
        <span
          aria-hidden="true"
          class="inline-grid h-3.5 w-3.5 place-items-center rounded-[4px] border-[1.5px] text-[10px] leading-none text-surface"
          :class="tickedKeys.includes(f.key) ? 'border-ink bg-ink' : 'border-faint'"
        >
          {{ tickedKeys.includes(f.key) ? '✓' : '' }}
        </span>
        {{ f.label }}
      </label>
      <label class="ml-auto inline-flex items-center gap-2 text-[13px] text-muted-strong">
        {{ t(w('filters.who')) }}
        <select
          class="max-w-[260px] rounded-full border bg-surface px-3 py-[5px] text-[13px]"
          :class="whoParam ? 'border-ink text-ink' : 'border-dashed border-line text-muted-strong'"
          data-filter="who"
          :value="whoShown"
          @change="write({ who: ($event.target as HTMLSelectElement).value })"
        >
          <option value="" :selected="whoShown === ''">{{ t(w('filters.everyone')) }}</option>
          <option v-for="o in whoOptions" :key="o.value" :value="o.value" :selected="whoShown === o.value">{{ o.label }}</option>
          <option :value="OPERATOR" :selected="whoShown === OPERATOR">{{ t(w('operator')) }}</option>
        </select>
      </label>
    </div>

    <p
      v-for="m in missing"
      :key="m"
      role="alert"
      class="mb-2.5 max-w-[78ch] border-l-2 border-status-late py-0.5 pl-2.5 text-[12.5px] text-status-late-fg"
      data-note="missing"
    >
      {{ m }}
    </p>

    <div class="history-list">
      <div v-if="waiting || !lines.length" class="rounded-card border border-line bg-surface text-center">
        <StateBlock v-if="waiting" state="loading" :title="t(w('loading'))" />
        <StateBlock v-else state="empty" :title="narrowed ? t(w('emptyFiltered')) : t(w('empty'))" />
      </div>
      <DayList
        v-else
        :days="shown.groups"
        :label="t(w('title'))"
        :level="2"
        :older-label="merged.more ? t(w('older')) : undefined"
        :older-busy="history.loading"
        :note="t(w('showing'), { n: lines.length })"
        @older="history.older(isShown)"
      >
        <template #line="{ line }">
          <template v-for="f in asFold(line.key)" :key="f.key">
            <span aria-hidden="true" class="text-muted-strong">{{ opened.has(f.key) ? '▾' : '▸' }}</span>
            {{ ' ' }}
            <b class="font-semibold text-ink">{{ t(w(f.count === 1 ? 'foldOne' : 'fold'), { n: f.run.length, m: f.count }) }}</b><template v-if="f.names">: {{ f.names }}</template>
            <button
              type="button"
              class="ml-3 whitespace-nowrap rounded-chip text-status-ontrack-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              data-act="fold"
              :aria-expanded="opened.has(f.key)"
              @click="toggle(f.key)"
            >
              {{ opened.has(f.key) ? t(w('hideThem')) : t(w('showThem')) }}
            </button>
          </template>
          <template v-for="d in asLine(line.key)" :key="d.id">
            <b class="font-semibold">{{ d.whoName }}</b>
            {{ ' ' }}
            {{ d.words ? t(d.words.key, d.words.values ?? {}) : t(w('lines.unworded')) }}
            <span v-if="d.detail" class="mt-px block font-mono text-[11.5px] text-faint">{{ t(d.detail.key, d.detail.values ?? {}) }}</span>
          </template>
        </template>
      </DayList>
    </div>
  </section>
</template>

<style scoped>
/* The area closes each line at the right; a narrow card puts it under the sentence, on the left. */
.history-list :deep(li > span:nth-child(3)) {
  text-align: right;
}
@container (max-width: 700px) {
  .history-list :deep(li > span:nth-child(3)) {
    text-align: left;
  }
}
</style>
