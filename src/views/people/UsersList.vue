<script setup lang="ts">
// Users: the people by what they hold, the ones who hold nothing across the
// workspace yet, and one person open beside the list, or alone when there is no
// room. The counts are the filters, and every count is made from the one read of
// the people, so each equals the rows its filter shows. Machines that act in the
// workspace are named apart and are not changed here: whoever runs the deployment
// sets them up.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import {
  Chip,
  CountStrip,
  foldForFind,
  ListTable,
  Pager,
  SegmentedChoice,
  SelectField,
  SplitDetail,
  StatusPill,
  TextField,
  type CountItem,
  type ListColumn,
  type SegmentedOption,
  type SelectOption,
  type StatusRole,
} from 'uibyte'

import { belongs, counts, daysAway, isAway, noteStart, PAGE_SIZE, SHOWS, typeInForce, wayOf, type Show } from '../../lib/people'
import { PEOPLE_ACCESS, PEOPLE_USER } from '../../routes'
import { usePeople, type Member } from '../../stores/people'
import SaidLine from '../../components/SaidLine.vue'
import ByAccess from './ByAccess.vue'
import InvitePanel from './InvitePanel.vue'
import PersonPanel from './PersonPanel.vue'
import { useLast } from './useLast'

const props = defineProps<{ openId: string; inviting?: boolean }>()
const emit = defineEmits<{ closeInvite: [] }>()

const { t, locale } = useI18n()
const router = useRouter()
const people = usePeople()
const lastSignedIn = useLast()
const w = (key: string) => `configbyte.people.users.${key}`

const show = ref<string>('everyone')
const userType = ref('')
const role = ref('')
const query = ref('')
const withLost = ref(false)
const view = ref<string>('people')
const page = ref(1)

const byName = (a: Member, b: Member) => a.displayName.localeCompare(b.displayName, locale.value)
const sorted = computed(() => [...people.people].sort(byName))
const lost = computed(() => people.people.filter((m) => m.status === 'revoked').length)

/** Those who hold nothing across the workspace yet, by name. */
const arrivals = computed(() => sorted.value.filter((m) => belongs('nothing', m)))
const BAND = 5

const items = computed<CountItem[]>(() => {
  const n = counts(people.people, withLost.value)

  return SHOWS.map((s) => ({ key: s, label: t(w(`show.${s}`)), count: String(n[s]) }))
})

/** Every filter and the search narrow together. */
const needle = computed(() => foldForFind(query.value))
const rows = computed(() =>
  sorted.value.filter(
    (m) =>
      (withLost.value || m.status !== 'revoked') &&
      belongs(show.value as Show, m) &&
      (!userType.value || typeInForce(m)?.id === userType.value) &&
      (!role.value || m.tenantRoles.some((r) => r.id === role.value)) &&
      (!needle.value || foldForFind(m.displayName).includes(needle.value)),
  ),
)

const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)))
const pageNo = computed(() => Math.min(page.value, pages.value))
const shown = computed(() => rows.value.slice((pageNo.value - 1) * PAGE_SIZE, pageNo.value * PAGE_SIZE))
const range = computed(() =>
  t(w('pager.range'), { from: (pageNo.value - 1) * PAGE_SIZE + 1, to: Math.min(rows.value.length, pageNo.value * PAGE_SIZE), total: rows.value.length }),
)

// A change to what is shown goes back to the first page.
watch([show, userType, role, query, withLost], () => {
  page.value = 1
})

const member = computed(() => (props.openId ? people.people.find((m) => m.id === props.openId) : undefined))

// Opening a person turns the list to the page they are on.
watch(
  () => props.openId,
  (id) => {
    const at = id ? rows.value.findIndex((m) => m.id === id) : -1
    if (at >= 0) page.value = Math.floor(at / PAGE_SIZE) + 1
  },
  { immediate: true },
)

// By access has no person beside it.
watch(view, (now) => {
  if (now === 'access' && props.openId) void router.replace({ name: PEOPLE_ACCESS })
})

function open(m: Member) {
  view.value = 'people'
  void router.push({ name: PEOPLE_USER, params: { id: m.id } })
}

function clear() {
  show.value = 'everyone'
  userType.value = ''
  role.value = ''
  query.value = ''
}

const typeOptions = computed<SelectOption[]>(() => people.userTypes.map((u) => ({ value: u.id, label: u.name })))
const roleOptions = computed<SelectOption[]>(() => people.roles.map((r) => ({ value: r.id, label: r.name })))
const viewOptions = computed<SegmentedOption[]>(() => [
  { key: 'people', label: t(w('views.people')) },
  { key: 'access', label: t(w('views.access')) },
])

const columns = computed<ListColumn[]>(() => [
  { key: 'name', label: t(w('columns.name')), priority: 1, width: 'minmax(220px,330px)' },
  { key: 'userType', label: t(w('columns.userType')), width: 'minmax(130px,180px)' },
  { key: 'roles', label: t(w('columns.roles')), width: 'minmax(190px,360px)' },
  { key: 'administrator', label: t(w('columns.administrator')), width: '140px' },
  { key: 'last', label: t(w('columns.last')), width: '130px' },
])

/** The small mark after a name: not signed in yet, away for a month, or without access. */
function mark(m: Member): { status: StatusRole; label: string } | null {
  if (m.status === 'invited') return { status: 'idle', label: t(w('marks.invited')) }
  if (m.status === 'revoked') return { status: 'idle', label: t(w('marks.revoked')) }
  if (isAway(m)) return { status: 'blocked', label: t(w('marks.away'), { n: daysAway(m) ?? 0 }) }

  return null
}

/** The words under a name that say what names the person: their email, or their personal code masked, or that nothing signs in as them. */
function wayWords(m: Member): string {
  const way = wayOf(m)
  if (!way) return ''
  if (way.kind === 'email') return way.email
  if (way.kind === 'none') return t(w('way.noneShort'))

  return `${t(w('way.cardShort'))} · ${way.country}${way.mask ? ` ${way.mask}` : ''}`
}

const link = (m: Member) => ({ to: { name: PEOPLE_USER, params: { id: m.id } } })
const more = (n: number) => t(w('arrivals.more'), { n })
</script>

<template>
  <div class="@container mt-5">
    <!-- With a person open and no room, the person takes the whole place, with a way back. -->
    <div :class="member ? '@max-[760px]:hidden' : ''">
      <p class="max-w-[92ch] text-[13.5px] text-muted-strong">{{ t(w('lead')) }}</p>
      <p v-if="!people.signInRead" class="mt-2 max-w-[92ch] text-[12.5px] text-muted-strong" data-note="sign-in-unread">{{ t(w('signInUnread')) }}</p>

      <InvitePanel v-if="inviting && !member" @close="emit('closeInvite')" />
      <SaidLine v-else-if="people.said?.place === 'invite' && people.said.kind === 'said'" :said="people.said" class="mt-3" />

      <section
        v-if="arrivals.length"
        class="mt-4 rounded-card border border-dashed border-line bg-surface px-[18px] pb-2.5 pt-3"
        data-block="arrivals"
      >
        <h3 class="text-[14px] font-semibold">{{ t(w('arrivals.heading'), { n: arrivals.length }) }}</h3>
        <p class="mb-2 mt-1 max-w-[92ch] text-[12.5px] text-muted-strong">{{ t(w('arrivals.lead')) }}</p>
        <div class="flex flex-wrap items-center gap-1.5">
          <Chip v-for="m in arrivals.slice(0, BAND)" :key="m.id" tone="surface">
            <button
              type="button"
              class="rounded-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              @click="open(m)"
            >
              <bdi>{{ m.displayName }}</bdi> <small class="ml-1 text-[12px] text-muted">{{ lastSignedIn(m) }}</small>
            </button>
          </Chip>
          <button
            v-if="arrivals.length > BAND"
            type="button"
            class="rounded-chip px-1 text-[13px] text-status-ontrack-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            data-act="band-more"
            @click="show = 'nothing'"
          >
            {{ more(arrivals.length - BAND) }}
          </button>
        </div>
      </section>

      <CountStrip v-model="show" class="mb-4 mt-4" :items="items" :label="t(w('show.label'))">
        <template #more>
          <span class="ml-auto flex flex-wrap items-center gap-2">
            <SelectField
              v-model="userType"
              :options="typeOptions"
              :placeholder="t(w('filters.userType'))"
              :aria-label="t(w('filters.userTypeLabel'))"
              data-filter="user-type"
              size="sm"
              class="w-auto"
            />
            <SelectField
              v-model="role"
              :options="roleOptions"
              :placeholder="t(w('filters.role'))"
              :aria-label="t(w('filters.roleLabel'))"
              data-filter="role"
              size="sm"
              class="w-auto"
            />
            <label v-if="lost" class="inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted-strong">
              <input v-model="withLost" type="checkbox" data-filter="lost" />
              {{ t(w('showGone')) }}
              <b class="font-mono font-medium">{{ lost }}</b>
            </label>
            <SegmentedChoice v-model="view" :options="viewOptions" :label="t(w('views.label'))" />
            <TextField
              v-model="query"
              type="search"
              size="sm"
              :aria-label="t(w('find'))"
              :placeholder="t(w('find'))"
              data-filter="find"
              class="w-60 max-w-full"
            />
          </span>
        </template>
      </CountStrip>
    </div>

    <ByAccess v-if="view === 'access'" />

    <SplitDetail v-else :open="!!member" :back-label="t('configbyte.people.tabs.users')" :label="member?.displayName" @back="router.push({ name: PEOPLE_ACCESS })">
      <template #list>
        <ListTable
          :columns="columns"
          :rows="shown"
          :row-key="(m) => m.id"
          :label="t(w('views.people'))"
          :row-link="link"
          :link-component="RouterLink"
          :current="openId || undefined"
        >
          <template #cell-name="{ row }">
            <span class="flex min-w-0 flex-col" :class="row.status === 'revoked' ? 'text-faint' : ''">
              <span class="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <b class="font-semibold"><bdi>{{ row.displayName }}</bdi></b>
                <StatusPill v-if="mark(row)" size="sm" :status="mark(row)!.status" :label="mark(row)!.label" />
              </span>
              <small v-if="wayWords(row) || noteStart(row.note ?? '')" class="truncate text-[12px] text-muted" data-line="way">
                <span v-if="wayWords(row)" :class="wayOf(row)?.kind === 'none' ? 'font-sans text-status-blocked-fg' : 'font-mono'">
                  <bdi v-if="wayOf(row)?.kind === 'email'">{{ wayWords(row) }}</bdi>
                  <template v-else>{{ wayWords(row) }}</template>
                </span>
                <template v-if="wayWords(row) && noteStart(row.note ?? '')"> · </template>
                <i v-if="noteStart(row.note ?? '')" class="not-italic text-muted-strong" data-line="note"><bdi>{{ noteStart(row.note ?? '') }}</bdi></i>
              </small>
            </span>
          </template>
          <!-- A cell always draws an element: a slot that draws nothing falls back to the raw value. -->
          <template #cell-userType="{ row }">
            <span>
              <Chip v-if="typeInForce(row)" tone="surface" :given="!!row.chartUserType" :note="row.chartUserType ? t(w('chartGives')) : undefined">
                {{ typeInForce(row)!.name }}
              </Chip>
            </span>
          </template>
          <template #cell-roles="{ row }">
            <span class="inline-flex flex-wrap items-center gap-1">
              <Chip v-for="r in row.tenantRoles" :key="r.id">{{ r.name }}</Chip>
              <span v-if="!row.tenantRoles.length" class="text-faint">—</span>
            </span>
          </template>
          <template #cell-administrator="{ row }">
            <span class="whitespace-nowrap font-semibold text-status-ontrack-fg" :data-administrator="row.administrator ? 'yes' : 'no'">{{
              row.administrator ? t(w('administratorYes')) : ''
            }}</span>
          </template>
          <template #cell-last="{ row }">
            <span :class="row.status === 'revoked' ? 'text-faint' : 'text-muted-strong'">{{ lastSignedIn(row) }}</span>
          </template>
          <template #footer>
            <p v-if="!rows.length" class="border-t border-line px-[18px] py-[22px] text-[13.5px] text-muted-strong" data-note="no-match">
              {{ t(w('noMatch')) }}
              <button
                type="button"
                class="rounded-chip text-status-ontrack-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                @click="clear"
              >
                {{ t(w('showEveryone')) }}
              </button>
            </p>
            <Pager
              v-if="pages > 1"
              :page="pageNo"
              :pages="pages"
              :range="range"
              :label="t(w('pager.label'))"
              :previous-label="t(w('pager.previous'))"
              :next-label="t(w('pager.next'))"
              :page-label="(n) => t(w('pager.page'), { n })"
              @update:page="(n) => (page = n)"
            />
            <p
              v-if="people.machines.length"
              class="border-t border-line bg-band px-[18px] py-[11px] text-[12.5px] text-muted-strong"
              data-block="machines"
            >
              {{ t(w('machines'), { n: people.machines.length, names: people.machines.map((m) => m.displayName).join(' · ') }) }}
            </p>
          </template>
        </ListTable>
      </template>
      <template #detail>
        <PersonPanel v-if="member" :member="member" />
      </template>
    </SplitDetail>
  </div>
</template>
