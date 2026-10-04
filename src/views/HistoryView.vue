<script setup lang="ts">
// History: every change a person made to this workspace's setup, whichever way it
// was made, in one list, newest first. Each service keeps its own history; this
// screen reads them and keeps no copy. Nothing on a line can be changed.
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'uibyte'

import { labelOf, permissionName } from '../lib/boxes'
import { merge, namesFromLines, registerWords, transportWords, type Placed, type Stream, type Worded } from '../lib/history'
import { useAdminOptions, type LineWords } from '../options'
import { REGISTER_FILTER, useHistory } from '../stores/history'
import { usePeople } from '../stores/people'
import { useAdminSession } from '../stores/session'

const { t, locale } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const people = usePeople()
const history = useHistory()
const w = (key: string) => `configbyte.history.${key}`

const register = computed(() => (options.register && session.order.includes(options.register) ? options.register : undefined))
const sources = computed(() => (options.history?.sources ?? []).filter((s) => session.order.includes(s.section)))

/** The filters, each shown only for a service that answered the coordinator's start check. */
const filters = computed(() => {
  const host = (options.history?.filters ?? [])
    .filter((f) => sources.value.some((s) => s.filter === f.key))
    .map((f) => ({ key: f.key, label: t(f.word) }))
  if (!register.value) return host
  const own = { key: REGISTER_FILTER, label: t(w('filters.people')) }

  return [...host.slice(0, 1), own, ...host.slice(1)]
})
const ticked = reactive<Record<string, boolean>>({})
const isShown = (s: Stream) => ticked[s.filter] !== false && !s.failed
const who = ref('')

onMounted(async () => {
  if (register.value && session.me && !people.loaded) {
    void people.load({ section: register.value, tenant: session.me.tenant, fields: options.roles?.fields })
  }
  await history.start({ register: register.value, sources: sources.value })
})

/** Names the register keeps, and names learnt from earlier lines for what was since deleted. */
const learnt = computed(() => namesFromLines(history.streams.flatMap((s) => s.lines)))
const boxWords = computed(() => {
  const words = new Map<string, string>()
  for (const s of people.services) for (const p of s.permissions) words.set(permissionName(s.key, p), labelOf(p, locale.value))
  for (const f of people.fields ?? []) words.set(f.permission, t('configbyte.people.roles.fieldBox', { field: f.name }))

  return words
})
const names = {
  member: (id: string) => people.byId(id)?.displayName ?? '',
  role: (id: string) => people.roles.find((r) => r.id === id)?.name ?? '',
  type: (id: string) => people.userTypes.find((u) => u.id === id)?.name ?? learnt.value.types.get(id) ?? '',
  position: (id: string) => people.positions.find((p) => p.id === id)?.name ?? learnt.value.positions.get(id) ?? '',
  box: (permission: string) => boxWords.value.get(permission) ?? permission,
}

interface Drawn {
  id: string
  day: string
  time: string
  whoKey: string
  whoName: string
  words: LineWords | null
  kind: string
  detail?: LineWords
  chip: string
}

/** A day as a heading: its year only when it is not this year's. */
const dayFormat = computed(() => {
  const thisYear = new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long' })
  const anyYear = new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', year: 'numeric' })
  const year = new Date().getFullYear()

  return { format: (when: Date) => (when.getFullYear() === year ? thisYear : anyYear).format(when) }
})
const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))

function draw(p: Placed): Drawn {
  const line = p.line
  let worded: Worded | null
  if (p.stream.key === 'register') worded = registerWords(line, names)
  else {
    worded = transportWords(line)
    const hostWords = worded ? null : (options.history?.describe?.(line) ?? null)
    if (hostWords) worded = { who: { actor: line.actor }, words: hostWords }
  }
  const memberId = worded?.who.member
  const member = memberId ? people.byId(memberId) : people.bySubject(line.actor)
  const when = new Date(p.when)

  return {
    id: `${p.stream.key}:${line.id}`,
    day: dayFormat.value.format(when),
    time: timeFormat.value.format(when),
    whoKey: member?.subjectKey ?? line.actor,
    whoName: member?.displayName ?? line.actor,
    words: worded?.words ?? null,
    kind: line.kind,
    ...(worded?.detail ? { detail: worded.detail } : {}),
    chip: p.stream.key === 'register' ? t(w('chips.people')) : t(p.stream.chip),
  }
}

const merged = computed(() => merge(history.streams.filter(isShown)))
const drawn = computed(() => merged.value.lines.map(draw))
const lines = computed(() => drawn.value.filter((d) => !who.value || d.whoKey === who.value))

/** Who can be picked: everyone who acted in the lines read so far. */
const actors = computed(() => {
  const seen = new Map<string, string>()
  for (const d of drawn.value) if (!seen.has(d.whoKey)) seen.set(d.whoKey, d.whoName)

  return [...seen].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, locale.value))
})

/** The lines under the day each happened on. */
const days = computed(() => {
  const out: { day: string; lines: Drawn[] }[] = []
  for (const d of lines.value) {
    const last = out[out.length - 1]
    if (last && last.day === d.day) last.lines.push(d)
    else out.push({ day: d.day, lines: [d] })
  }

  return out
})

const narrowed = computed(() => who.value !== '' || filters.value.some((f) => ticked[f.key] === false))

/** A service whose lines could not be read, said once each. */
const missing = computed(() => {
  const out = new Map<string, string>()
  for (const s of history.streams) {
    if (!s.failed || ticked[s.filter] === false || out.has(s.section)) continue
    const title = options.sections[s.section]?.title
    const service = title ? t(title) : s.section
    out.set(s.section, s.failed === 'unanswered' ? t(w('notAnswering'), { service }) : t(w('unread'), { service, reason: s.failed }))
  }

  return [...out.values()]
})
</script>

<template>
  <section class="mx-auto max-w-5xl px-8 py-8">
    <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t('configbyte.frame.shell.workspace') }}</p>
    <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t(w('title')) }}</h1>
    <p class="mt-2 max-w-3xl text-muted-strong">{{ t(w('lead')) }}</p>

    <div class="mt-5 flex flex-wrap items-center gap-4 text-[13.5px]" data-block="filters">
      <label v-for="f in filters" :key="f.key" class="flex items-center gap-1.5">
        <input type="checkbox" :checked="ticked[f.key] !== false" :data-filter="f.key" @change="ticked[f.key] = ($event.target as HTMLInputElement).checked" />
        {{ f.label }}
      </label>
      <label class="flex items-center gap-1.5">
        {{ t(w('filters.who')) }}
        <select v-model="who" class="rounded-lg border border-line px-2 py-1" data-filter="who">
          <option value="">{{ t(w('filters.everyone')) }}</option>
          <option v-for="a in actors" :key="a.key" :value="a.key">{{ a.name }}</option>
        </select>
      </label>
    </div>

    <p v-for="m in missing" :key="m" role="alert" class="mt-3 text-[13px] text-status-late-fg" data-note="missing">{{ m }}</p>

    <div class="mt-4 rounded-card border border-line bg-surface">
      <p v-if="history.loading && !drawn.length" role="status" class="px-4 py-4 text-muted-strong">{{ t(w('loading')) }}</p>
      <p v-else-if="!lines.length" class="px-4 py-6 text-center text-muted-strong" data-state="empty">
        {{ narrowed ? t(w('emptyFiltered')) : t(w('empty')) }}
      </p>
      <template v-for="d in days" :key="d.day">
        <h2 class="border-b border-line bg-band px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-faint">{{ d.day }}</h2>
        <div v-for="l in d.lines" :key="l.id" class="flex gap-3 border-b border-line px-4 py-2 text-[13.5px] last:border-0" data-line>
          <span class="w-12 shrink-0 font-mono text-[12px] text-faint">{{ l.time }}</span>
          <span class="min-w-0 flex-1">
            <b>{{ l.whoName }}</b>
            {{ ' ' }}
            <template v-if="l.words">{{ t(l.words.key, l.words.values ?? {}) }}</template>
            <code v-else class="font-mono text-[12px]">{{ l.kind }}</code>
            <span v-if="l.detail" class="block font-mono text-[11.5px] text-faint">{{ t(l.detail.key, l.detail.values ?? {}) }}</span>
          </span>
          <span class="shrink-0 font-mono text-[11px] text-faint">{{ l.chip }}</span>
        </div>
      </template>
      <div v-if="lines.length" class="flex items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-muted-strong">
        <span>{{ t(w('showing'), { n: lines.length }) }}</span>
        <Button v-if="merged.more" size="sm" variant="outline" :disabled="history.loading" data-act="older" @click="history.older(isShown)">
          {{ t(w('older')) }}
        </Button>
      </div>
    </div>
  </section>
</template>
