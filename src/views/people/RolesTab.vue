<script setup lang="ts">
// Roles: one of the workspace's roles at a time, its boxes in the groups and the
// words the services declare. A role's ticks are saved as one act, so a box just
// ticked says what it hands out before Save. Setting the workspace up is never a
// role's, so no setup box is offered: it comes only with the Administrator
// checkbox.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { fieldFamilies, groupBoxes, sameSet, wholeSet, type Box, type ShownGroup } from '../../lib/boxes'
import { useAdminOptions, type FieldBox } from '../../options'
import { usePeople, type Role } from '../../stores/people'
import { useAdminSession } from '../../stores/session'

const { t, locale } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const people = usePeople()
const w = (key: string) => `configbyte.people.roles.${key}`

/** The role open: its id, or empty for a new one. */
const openId = ref(people.roles[0]?.id ?? '')
const creating = ref(people.roles.length === 0)
const name = ref('')
const ticked = ref(new Set<string>())

const role = computed<Role | undefined>(() => (creating.value ? undefined : people.roles.find((r) => r.id === openId.value)))
const saved = computed(() => new Set(role.value?.permissions ?? []))

/** Every permission this workspace has: an administrator holds all of them. */
const has = computed(() => new Set(Object.values(session.me?.sections ?? {}).flat()))

const groups = computed<ShownGroup[]>(() =>
  groupBoxes({
    services: people.services,
    use: 'role',
    lang: locale.value,
    has: has.value,
    holds: saved.value,
    groups: (options.roles?.groups ?? []).map((g) => ({ title: t(g.word), prefixes: g.prefixes })),
    fields: (people.fields ?? []).map((f) => ({ ...f, title: t(f.group) })),
  }),
)
const shown = computed(() => new Set(groups.value.flatMap((g) => g.boxes.map((b) => b.name))))

function reset() {
  name.value = role.value?.name ?? ''
  ticked.value = new Set([...saved.value].filter((n) => shown.value.has(n)))
}
watch([openId, creating, () => people.roles, groups], reset, { immediate: true })

function open(id: string) {
  creating.value = false
  openId.value = id
  people.said = null
}

function startNew() {
  creating.value = true
  openId.value = ''
  people.said = null
}

function tick(box: Box, on: boolean) {
  const next = new Set(ticked.value)
  if (on) next.add(box.name)
  else next.delete(box.name)
  ticked.value = next
}

function boxLabel(box: Box): string {
  return box.field ? t(w('fieldBox'), { field: box.field.name }) : box.label
}

/**
 * What a field's box hands out, said before Save: under a box just ticked, and
 * under one already held whose sentence the other ticks have changed.
 */
function guard(box: Box): string {
  const field: FieldBox | undefined = box.field
  if (!field || !options.roles?.guard || !ticked.value.has(box.name)) return ''
  const now = options.roles.guard(field, [...ticked.value])
  if (!now) return ''
  if (saved.value.has(box.name)) {
    const before = options.roles.guard(field, [...saved.value])
    if (before && before.key === now.key && JSON.stringify(before.values ?? {}) === JSON.stringify(now.values ?? {})) return ''
  }

  return t(now.key, { field: field.name, ...(now.values ?? {}) })
}

const boxesChanged = computed(() => !sameSet(ticked.value, [...saved.value].filter((n) => shown.value.has(n))))
const nameChanged = computed(() => name.value.trim() !== (role.value?.name ?? ''))
const canSave = computed(() => name.value.trim() !== '' && (creating.value || boxesChanged.value || nameChanged.value))

async function save() {
  const permissions = wholeSet({
    shown: shown.value,
    ticked: ticked.value,
    held: role.value?.permissions ?? [],
    fieldBoxes: people.fields ? people.fields.map((f) => f.permission) : null,
    families: fieldFamilies(people.services),
  })
  const id = await people.saveRole({
    id: role.value?.id ?? '',
    name: name.value.trim(),
    was: role.value?.name ?? '',
    permissions,
    changed: creating.value ? permissions.length > 0 : boxesChanged.value || !sameSet(permissions, saved.value),
  })
  if (id) {
    creating.value = false
    openId.value = id
  }
}

async function remove() {
  if (!role.value) return
  if (await people.deleteRole(role.value)) {
    creating.value = people.roles.length === 0
    openId.value = people.roles[0]?.id ?? ''
  }
}

const tickedIn = (g: ShownGroup) => g.boxes.filter((b) => ticked.value.has(b.name)).length
</script>

<template>
  <div class="mt-5">
    <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('configbyte.people.tabs.roles')">
      <button
        v-for="r in people.roles"
        :key="r.id"
        type="button"
        :aria-pressed="!creating && r.id === openId"
        class="rounded-full border px-3 py-1 text-[13px]"
        :class="!creating && r.id === openId ? 'border-ink bg-ink text-paper' : 'border-line'"
        @click="open(r.id)"
      >
        {{ r.name }}
      </button>
      <button
        type="button"
        :aria-pressed="creating"
        class="rounded-full border border-dashed px-3 py-1 text-[13px]"
        :class="creating ? 'border-ink' : 'border-line text-muted-strong'"
        data-act="new-role"
        @click="startNew"
      >
        {{ t(w('new')) }}
      </button>
    </div>

    <section class="mt-4 rounded-card border border-line bg-surface px-5 py-4" data-role-card>
      <div class="flex flex-wrap items-center gap-3">
        <label class="sr-only" for="role-name">{{ t(w('name')) }}</label>
        <input id="role-name" v-model="name" class="rounded-lg border border-line px-3 py-1.5 text-[14px] font-semibold" :placeholder="t(w('name'))" />
        <span class="text-[12.5px] text-faint">{{ role?.seed ? t(w('shipped')) : creating ? '' : t(w('made')) }}</span>
      </div>

      <div class="mt-3 rounded-lg bg-band px-3 py-2 text-[12.5px] text-muted-strong">
        <p>{{ t(w('administrators')) }}</p>
        <p class="mt-1 font-semibold text-ink">{{ t(w('noSetup')) }}</p>
      </div>

      <p v-if="!people.services.length" role="alert" class="mt-3 text-[13px] text-status-late-fg">{{ t(w('noVocabulary')) }}</p>
      <p v-if="people.fields === null" class="mt-3 text-[12.5px] text-muted-strong" data-note="fields-unread">{{ t(w('fieldsUnread')) }}</p>

      <details v-for="g in groups" :key="g.key" class="mt-3 rounded-lg border border-line px-3 py-2" :open="tickedIn(g) > 0 || g.key.startsWith('fields-')">
        <summary class="cursor-pointer font-semibold">
          {{ g.title }}
          <small class="ml-2 font-normal text-faint">{{ t(w('ticked'), { n: tickedIn(g), of: g.boxes.length }) }}</small>
        </summary>
        <label v-for="b in g.boxes" :key="b.name" class="mt-2 flex items-start gap-2 text-[13.5px]" :data-box="b.name">
          <input type="checkbox" class="mt-1" :checked="ticked.has(b.name)" @change="tick(b, ($event.target as HTMLInputElement).checked)" />
          <span>
            {{ boxLabel(b) }}
            <small v-if="b.retired" class="ml-1 text-faint">{{ t(w('retired')) }}</small>
            <span v-if="guard(b)" class="mt-1 block rounded-md border border-status-approaching-border bg-status-approaching-bg px-2 py-1 text-[12.5px] text-status-approaching-fg" data-guard>
              {{ guard(b) }}
            </span>
          </span>
        </label>
      </details>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" :disabled="!canSave" data-act="save-role" @click="save">{{ t(w('save')) }}</Button>
        <Button size="sm" variant="outline" @click="reset(); people.said = null">{{ t(w('cancel')) }}</Button>
        <Button v-if="role && !role.seed" size="sm" variant="outline" class="ml-auto text-status-late-fg" data-act="delete-role" @click="remove">
          {{ t(w('delete')) }}
        </Button>
      </div>
      <SaidLine v-if="people.said" :said="people.said" />
    </section>
  </div>
</template>
