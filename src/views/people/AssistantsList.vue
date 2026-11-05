<script setup lang="ts">
// Assistants: each one person's own, through which that person's AI app works in
// the workspace for them, as that person and never beyond its own roles. Each row
// names its person, its roles across the workspace, the AI apps connected as it
// and when one was last used; one assistant opens beside the list, or alone when
// there is no room. Removed ones stay behind a choice, so old history keeps a
// name. Nobody holds a key: a person connects an app by signing in at it.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { Button, Chip, ListTable, SplitDetail, StateBlock, StatusPill, type ListColumn } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { PEOPLE_ASSISTANT, PEOPLE_ASSISTANTS } from '../../routes'
import { usePeople, type Assistant } from '../../stores/people'
import AddAssistantPanel from './AddAssistantPanel.vue'
import AssistantMark from './AssistantMark.vue'
import AssistantPanel from './AssistantPanel.vue'
import { useWhen } from './useWhen'

const props = defineProps<{ openId: string; adding?: boolean }>()
const emit = defineEmits<{ add: []; closeAdd: [] }>()

const { t, locale } = useI18n()
const router = useRouter()
const people = usePeople()
const when = useWhen()
const w = (key: string) => `configbyte.people.assistants.${key}`

onMounted(() => void people.ensureAssistants())

const withRemoved = ref(false)
const byName = (a: Assistant, b: Assistant) => a.name.localeCompare(b.name, locale.value)
const live = computed(() => people.assistants.filter((a) => a.status !== 'revoked'))
const removedCount = computed(() => people.assistants.length - live.value.length)
const rows = computed(() => [...people.assistants].filter((a) => withRemoved.value || a.status !== 'revoked').sort(byName))
const assistant = computed(() => (props.openId ? people.assistants.find((a) => a.id === props.openId) : undefined))

/** One of them, to show how history names what an assistant did. */
const example = computed(() => live.value.find((a) => a.person) ?? null)

// A removed assistant opened shows its row too.
watch(assistant, (a) => {
  if (a?.status === 'revoked') withRemoved.value = true
})

// An address naming an assistant the list does not hold opens the list.
watch(
  [() => people.assistantsLoaded, () => props.openId],
  () => {
    if (people.assistantsLoaded && !people.assistantsFailed && props.openId && !assistant.value) void router.replace({ name: PEOPLE_ASSISTANTS })
  },
  { immediate: true },
)

const columns = computed<ListColumn[]>(() => [
  { key: 'name', label: t('configbyte.people.users.columns.name'), priority: 1, width: 'minmax(200px,300px)' },
  { key: 'person', label: t(w('columns.person')), width: 'minmax(150px,220px)' },
  { key: 'roles', label: t('configbyte.people.users.columns.roles'), width: 'minmax(150px,300px)' },
  { key: 'apps', label: t(w('columns.apps')), width: 'minmax(110px,150px)' },
  { key: 'last', label: t(w('columns.last')), width: '120px' },
])

const rolesOf = (a: Assistant) => people.bySubject(a.subjectKey)?.tenantRoles ?? []

/** Its connected apps: their count, *no app yet*, or a dash while they are read or could not be. */
function appsOf(a: Assistant): string {
  const apps = people.apps[a.subjectKey]
  if (!apps || apps.state !== 'read') return '—'
  const n = apps.lines.length

  return n ? t(w('appsCount'), { n }, n) : t(w('noAppYet'))
}

/** When a call last went through any of its apps; a dash when none did. */
function lastUsed(a: Assistant): string {
  const used = (people.apps[a.subjectKey]?.lines ?? []).map((c) => c.lastUsed).filter((x): x is string => !!x).sort()
  const latest = used[used.length - 1]

  return latest ? when.day(latest) : '—'
}

const link = (a: Assistant) => ({ to: { name: PEOPLE_ASSISTANT, params: { id: a.id } } })

/** Why the assistants could not be read, in words. */
const failure = computed(() =>
  people.assistantsFailed === 'unanswered'
    ? t(w('failedUnanswered'))
    : people.assistantsFailed === 'notAdministrator'
      ? t('configbyte.people.refused.notAdministrator')
      : t(w('failed')),
)
</script>

<template>
  <div class="@container mt-5">
    <div :class="assistant ? '@max-[760px]:hidden' : ''">
      <p class="max-w-[92ch] text-[13.5px] text-muted-strong" data-note="lead">
        {{ t(w('lead')) }}<template v-if="example"
          >{{ t(w('leadExample')) }} <b class="font-semibold text-ink"><bdi>{{ example.person?.displayName }}</bdi></b> <AssistantMark :name="example.name" /></template
        >.
      </p>

      <AddAssistantPanel v-if="adding && !assistant" @close="emit('closeAdd')" />
    </div>

    <StateBlock v-if="!people.assistantsLoaded" state="loading" :title="t(w('loading'))" />
    <p v-else-if="people.assistantsFailed" role="alert" class="mt-6 text-status-late-fg" data-state="assistants-failed">{{ failure }}</p>

    <template v-else>
      <!-- None live: the empty list with its one button. -->
      <div v-if="!live.length && !adding" class="mt-4 rounded-card border border-line bg-surface" data-block="no-assistant">
        <StateBlock state="empty" size="page" :title="t(w('none.title'))" :text="t(w('none.text'))">
          <template #actions>
            <Button size="sm" data-act="assistant-add-first" @click="emit('add')">{{ t(w('add.open')) }}</Button>
          </template>
        </StateBlock>
      </div>

      <label v-if="removedCount" class="mt-4 inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted-strong" :class="assistant ? '@max-[760px]:hidden' : ''">
        <input v-model="withRemoved" type="checkbox" data-filter="removed-assistants" />
        {{ t(w('showRemoved')) }}
        <b class="font-mono font-medium">{{ removedCount }}</b>
      </label>

      <SplitDetail
        v-if="rows.length || assistant"
        class="mt-4"
        :open="!!assistant"
        :back-label="t('configbyte.people.tabs.assistants')"
        :label="assistant?.name"
        @back="router.push({ name: PEOPLE_ASSISTANTS })"
      >
        <template #list>
          <ListTable
            :columns="columns"
            :rows="rows"
            :row-key="(a) => a.id"
            :label="t('configbyte.people.tabs.assistants')"
            :row-link="link"
            :link-component="RouterLink"
            :current="openId || undefined"
          >
            <template #cell-name="{ row }">
              <span class="flex min-w-0 flex-col" :class="row.status === 'revoked' ? 'text-faint' : ''">
                <span class="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <b class="font-semibold"><bdi>{{ row.name }}</bdi></b>
                  <StatusPill
                    v-if="row.status === 'revoked'"
                    size="sm"
                    status="idle"
                    :label="t(w('removedOn'), { day: row.removedAt ? when.day(row.removedAt) : '' })"
                  />
                </span>
                <small class="text-[12px] text-muted">{{ t(w('addedOn'), { day: when.day(row.addedAt) }) }}</small>
              </span>
            </template>
            <template #cell-person="{ row }">
              <span><bdi>{{ row.person?.displayName ?? '—' }}</bdi></span>
            </template>
            <template #cell-roles="{ row }">
              <span class="inline-flex flex-wrap items-center gap-1">
                <template v-if="row.status !== 'revoked'"><Chip v-for="r in rolesOf(row)" :key="r.id">{{ r.name }}</Chip></template>
                <span v-if="row.status === 'revoked' || !rolesOf(row).length" class="text-faint">—</span>
              </span>
            </template>
            <template #cell-apps="{ row }">
              <span :class="row.status === 'revoked' ? '' : 'text-muted-strong'">{{ row.status === 'revoked' ? '' : appsOf(row) }}</span>
            </template>
            <template #cell-last="{ row }">
              <span class="text-muted-strong">{{ row.status === 'revoked' ? '' : lastUsed(row) }}</span>
            </template>
            <template #footer>
              <p class="border-t border-line bg-band px-[18px] py-[11px] text-[12.5px] text-muted-strong" data-block="no-key">{{ t(w('noKey')) }}</p>
            </template>
          </ListTable>
        </template>
        <template #detail>
          <AssistantPanel v-if="assistant" :assistant="assistant" />
        </template>
      </SplitDetail>
      <SaidLine v-else-if="people.said && !adding" :said="people.said" class="mt-3" />
    </template>
  </div>
</template>
