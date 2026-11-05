<script setup lang="ts">
// One assistant open: its name with Rename, its person (chosen when it was added,
// never changed), its roles given and taken as a person's, the AI apps connected
// as it with Sign out, and Remove. Signing an app out and removing are asked
// first, in place. A removed assistant says only that nobody can use it any more.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Chip, ConfirmAsk, SelectField, TextField, type SelectOption } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { usePeople, type Assistant, type Connection } from '../../stores/people'
import AssistantMark from './AssistantMark.vue'
import { nameProblem } from './assistantName'
import { useWhen } from './useWhen'

const props = defineProps<{ assistant: Assistant }>()

const { t } = useI18n()
const people = usePeople()
const when = useWhen()
const w = (key: string) => `configbyte.people.assistants.panel.${key}`

const draft = ref(props.assistant.name)
const asking = ref('')
const removing = ref(false)
const busy = ref(false)

// Another assistant opened: nothing typed, asked or said about the last one stays.
watch(
  () => props.assistant.id,
  () => {
    draft.value = props.assistant.name
    asking.value = ''
    removing.value = false
    people.said = null
  },
)
// A rename that went through shows the name the register now holds.
watch(
  () => props.assistant.name,
  (now) => {
    draft.value = now
  },
)

const removed = computed(() => props.assistant.status === 'revoked')
const person = computed(() => props.assistant.person?.displayName ?? '')
const first = computed(() => person.value.split(/\s+/)[0] ?? person.value)
/** Its own row among the people's read: the roles it holds across the workspace. */
const member = computed(() => people.bySubject(props.assistant.subjectKey))
const roles = computed(() => member.value?.tenantRoles ?? [])
const apps = computed(() => people.apps[props.assistant.subjectKey] ?? { state: 'reading' as const, lines: [] as Connection[] })

const roleOptions = computed<SelectOption[]>(() => {
  const held = new Set(roles.value.map((r) => r.id))

  return people.roles.map((r) => ({ value: r.id, label: r.name, disabled: held.has(r.id) }))
})

const sub = computed(() => {
  if (removed.value) return t(w('subRemoved'), { day: props.assistant.removedAt ? when.day(props.assistant.removedAt) : '' })
  const n = apps.value.lines.length
  const count = apps.value.state === 'read' ? (n ? t(w('appsConnected'), { n }, n) : t(w('noAppYet'))) : ''

  return [t(w('sub'), { person: person.value }), count].filter(Boolean).join(' · ')
})

/** Where the last act's words go: only acts on this page are said here. */
const said = computed(() => people.said)

async function rename() {
  const name = draft.value.trim()
  const problem = nameProblem(name)
  if (problem) {
    people.said = { kind: 'refused', key: problem, values: { name } }

    return
  }
  busy.value = true
  await people.renameAssistant(props.assistant, name)
  busy.value = false
}

async function onGive(id: string) {
  const role = people.roles.find((r) => r.id === id)
  if (role && member.value) await people.giveRole(member.value, role)
}

async function signOut(c: Connection) {
  busy.value = true
  await people.signOutApp(props.assistant, c, when.moment(c.connectedAt))
  busy.value = false
  asking.value = ''
}

async function remove() {
  busy.value = true
  await people.removeAssistant(props.assistant)
  busy.value = false
  removing.value = false
}

function connected(c: Connection): string {
  const at = t(w('connected'), { at: when.moment(c.connectedAt) })

  return `${at} · ${c.lastUsed ? t(w('lastUsed'), { when: when.moment(c.lastUsed) }) : t(w('notUsedYet'))}`
}

const section = 'border-t border-line px-[18px] py-3'
const lab = 'mb-1.5 block text-[13px] text-muted-strong'
const note = 'mt-1.5 text-[12.5px] text-muted-strong'
</script>

<template>
  <div data-panel="assistant">
    <div class="px-[18px] pb-3 pt-3.5">
      <h3 class="text-[18px] font-semibold tracking-tight" dir="auto">{{ assistant.name }}</h3>
      <p class="mt-0.5 text-[12.5px] text-muted-strong" data-line="assistant-sub">{{ sub }}</p>
    </div>

    <div v-if="removed" :class="section">
      <SaidLine v-if="said" :said="said" class="mb-2" />
      <p class="text-[12.5px] text-muted-strong" data-note="removed">
        {{ t(w('removedNote')) }} <AssistantMark :name="assistant.name" />. {{ t(w('removedName')) }}
      </p>
    </div>

    <template v-else>
      <div :class="section">
        <label :class="lab" for="assistant-rename">{{ t(w('name')) }}</label>
        <div class="flex flex-wrap items-center gap-2">
          <TextField id="assistant-rename" v-model="draft" size="sm" autocomplete="off" class="min-w-0 flex-1" data-assistant="rename" />
          <Button size="sm" variant="outline" :disabled="busy" data-act="assistant-rename" @click="rename">{{ t(w('rename')) }}</Button>
        </div>
        <p :class="note">{{ t(w('nameNote')) }}</p>
      </div>

      <SaidLine v-if="said" :said="said" class="mx-[18px] mb-1 mt-1" />

      <div :class="section">
        <span :class="lab">{{ t(w('person')) }}</span>
        <p>
          <b class="font-semibold"><bdi>{{ person || t(w('nobody')) }}</bdi></b>
          <small class="ml-2 text-[12px] text-muted">{{ t(w('added'), { day: when.day(assistant.addedAt) }) }}</small>
        </p>
        <p v-if="person" :class="note">{{ t(w('personNote'), { first }) }}</p>
      </div>

      <div :class="section">
        <span :class="lab">{{ t('configbyte.people.users.columns.roles') }}</span>
        <div class="flex flex-wrap items-center gap-1.5">
          <Chip v-for="r in roles" :key="r.id">
            {{ r.name }}
            <button
              v-if="member"
              type="button"
              class="rounded-chip px-0.5 text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              :aria-label="t('configbyte.people.users.panel.take', { role: r.name })"
              @click="people.takeRole(member, r)"
            >
              ×
            </button>
          </Chip>
          <span v-if="!roles.length" class="text-[13px] text-faint">{{ t('configbyte.people.users.panel.none') }}</span>
        </div>
        <SelectField
          v-if="member"
          class="mt-2"
          model-value=""
          :options="roleOptions"
          :placeholder="t('configbyte.people.users.panel.give')"
          :aria-label="t('configbyte.people.users.panel.give')"
          data-act="assistant-give-role"
          size="sm"
          @update:model-value="onGive"
        />
        <p :class="note">{{ t(w('rolesNote'), { name: assistant.name, first }) }}</p>
      </div>

      <div :class="section" data-block="apps">
        <span :class="lab">{{ t(w('apps')) }}</span>
        <p v-if="apps.state === 'reading' && !apps.lines.length" role="status" class="text-[13px] text-muted-strong">{{ t(w('appsReading')) }}</p>
        <p v-else-if="apps.state === 'unread'" role="alert" class="text-[13px] text-status-late-fg" data-note="apps-unread">{{ t(w('appsUnread')) }}</p>
        <p v-else-if="!apps.lines.length" class="text-[13px] text-muted-strong" data-note="no-app">
          {{ t(w('noApp'), { first, name: assistant.name }) }}
        </p>
        <ul v-else class="grid gap-2">
          <li v-for="c in apps.lines" :key="c.id" class="rounded-card border border-line px-3 py-2" :data-app="c.id">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b class="font-semibold"><bdi>{{ c.app }}</bdi></b>
                <small class="block text-[12px] text-muted">{{ connected(c) }}</small>
              </span>
              <Button v-if="asking !== c.id" size="sm" variant="outline" data-act="app-sign-out" @click="asking = c.id; people.said = null">
                {{ t(w('signOut')) }}
              </Button>
            </div>
            <ConfirmAsk
              v-if="asking === c.id"
              class="mt-2"
              :question="t(w('signOutAsk'), { app: c.app })"
              :detail="t(w('signOutDetail'), { name: assistant.name, first })"
              :confirm-label="t(w('signOutDo'))"
              :keep-label="t('configbyte.people.users.panel.cancel')"
              :busy="busy"
              danger
              @confirm="signOut(c)"
              @keep="asking = ''"
            />
          </li>
        </ul>
        <p :class="note">{{ t(w('appsNote'), { name: assistant.name }) }}</p>
      </div>

      <div :class="section">
        <p class="text-[12.5px] text-muted-strong" data-note="marks">
          {{ t(w('marksNote')) }} <b class="font-semibold text-ink"><bdi>{{ person }}</bdi></b> <AssistantMark :name="assistant.name" />.
          {{ t(w('marksOnly')) }}
        </p>
      </div>

      <div :class="section">
        <ConfirmAsk
          v-if="removing"
          :question="t(w('removeAsk'), { name: assistant.name })"
          :detail="t(w('removeDetail'), { name: assistant.name, first })"
          :confirm-label="t(w('removeDo'))"
          :keep-label="t('configbyte.people.users.panel.cancel')"
          :busy="busy"
          danger
          @confirm="remove"
          @keep="removing = false"
        />
        <div v-else class="flex justify-end">
          <Button size="sm" variant="outline" class="text-status-late-fg" data-act="assistant-remove" @click="removing = true; people.said = null">
            {{ t(w('remove'), { name: assistant.name }) }}
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
