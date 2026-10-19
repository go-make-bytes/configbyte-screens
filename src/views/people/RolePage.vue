<script setup lang="ts">
// One role, on a page of its own: its name, what it is for, and its boxes in the
// groups and words the services declare. The ticks are saved as one act, so a box
// just ticked says what it hands out before Save, and nothing changes for anyone
// until then. Setting the workspace up is never a role's, so no setup box is
// offered: it comes only with the Administrator checkbox.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { Button, PageHeader, TextField } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { fieldFamilies, sameSet, wholeSet, type Box, type ShownGroup } from '../../lib/boxes'
import { useAdminOptions, type FieldBox } from '../../options'
import { PEOPLE_ROLE, PEOPLE_ROLES } from '../../routes'
import { usePeople } from '../../stores/people'
import { useBoxes } from './useBoxes'

/** The role open: its id, or empty for one being made. */
const props = defineProps<{ roleId: string }>()

const { t } = useI18n()
const options = useAdminOptions()
const people = usePeople()
const router = useRouter()
const { roleGroups } = useBoxes()
const w = (key: string) => `configbyte.people.roles.${key}`

const creating = computed(() => props.roleId === '')
const role = computed(() => (creating.value ? undefined : people.roles.find((r) => r.id === props.roleId)))
const saved = computed(() => new Set(role.value?.permissions ?? []))

const groups = computed<ShownGroup[]>(() => roleGroups(saved.value))
const shown = computed(() => new Set(groups.value.flatMap((g) => g.boxes.map((b) => b.name))))
/** What the role holds among the boxes this page shows. */
const savedShown = computed(() => new Set([...saved.value].filter((n) => shown.value.has(n))))

const name = ref('')
const description = ref('')
const ticked = ref(new Set<string>())

function reset() {
  name.value = role.value?.name ?? ''
  description.value = role.value?.description ?? ''
  ticked.value = new Set(savedShown.value)
}

// Draw the page from the role once the boxes are known; a role just made takes the place of the form that made it.
watch([() => props.roleId, () => people.fieldsSettled], reset, { immediate: true })

// Another role opened: nothing said about the last one stays. A role just made keeps the line that says so.
watch(
  () => props.roleId,
  (_now, was) => {
    if (was !== '') people.said = null
  },
)

onMounted(() => {
  people.said = null
  void people.ensureFields(options.roles?.fields)
  void people.readSettings(options.roles?.settings ?? [])
})

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

const boxesChanged = computed(() => !sameSet(ticked.value, savedShown.value))
const wordsChanged = computed(() => name.value.trim() !== (role.value?.name ?? '') || description.value.trim() !== (role.value?.description ?? ''))
/** Each box ticked or unticked is one change; the name and what it is for together are one more. */
const changes = computed(() => {
  let n = wordsChanged.value ? 1 : 0
  for (const b of shown.value) if (ticked.value.has(b) !== savedShown.value.has(b)) n += 1

  return n
})
const canSave = computed(() => name.value.trim() !== '' && (creating.value || changes.value > 0))

function cancel() {
  reset()
  people.said = null
}

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
    description: description.value.trim(),
    wasDescription: role.value?.description ?? '',
    permissions,
    changed: creating.value ? permissions.length > 0 : boxesChanged.value || !sameSet(permissions, saved.value),
  })
  if (id && creating.value) await router.replace({ name: PEOPLE_ROLE, params: { id } })
}

async function remove() {
  const gone = role.value
  if (!gone) return
  // A setting of the host's that names this role is a place the register keeps it: it refuses, and the setting says so.
  const holds = options.roles?.settings?.find((s) => people.settings[s.key]?.roleId === gone.id)?.holds
  if (await people.deleteRole(gone, holds)) await router.push({ name: PEOPLE_ROLES })
}

const tickedIn = (g: ShownGroup) => g.boxes.filter((b) => ticked.value.has(b.name)).length
const fresh = (b: Box) => ticked.value.has(b.name) && !savedShown.value.has(b.name)

const subtitle = computed(() => {
  const kind = !creating.value && role.value?.seed ? t(w('shipped')) : t(w('made'))

  return `${kind} · ${t(w('boxesOf'), { n: ticked.value.size, m: shown.value.size })}`
})
</script>

<template>
  <div class="mt-5 max-w-[1040px]" data-role-card>
    <PageHeader
      :level="2"
      :title="creating ? t(w('new')) : (role?.name ?? '')"
      :subtitle="people.fieldsSettled ? subtitle : undefined"
      :back="{ label: t('configbyte.people.tabs.roles'), linkProps: { to: { name: PEOPLE_ROLES } } }"
      :link-component="RouterLink"
    />

    <p v-if="!people.fieldsSettled" role="status" class="mt-4 text-muted-strong">{{ t(w('reading')) }}</p>
    <template v-else>
      <div class="mt-3.5 flex flex-wrap items-center gap-2">
        <Button size="sm" :disabled="!canSave" data-act="save-role" @click="save">{{ t(w('save')) }}</Button>
        <Button size="sm" variant="outline" :disabled="changes === 0" data-act="cancel-role" @click="cancel">{{ t(w('cancel')) }}</Button>
        <Button v-if="role && !role.seed" size="sm" variant="outline" class="text-status-late-fg" data-act="delete-role" @click="remove">
          {{ t(w('delete')) }}
        </Button>
      </div>

      <SaidLine v-if="people.said" :said="people.said" class="mt-3" />

      <div class="mt-4 grid gap-3.5 rounded-card border border-line bg-surface px-[18px] py-4">
        <TextField id="role-name" v-model="name" :label="t(w('name'))" :placeholder="t(w('namePlaceholder'))" class="max-w-[520px]" />
        <TextField
          id="role-for"
          v-model="description"
          :label="t(w('for'))"
          :hint="t(w('forHint'))"
          :placeholder="t(w('forPlaceholder'))"
          class="max-w-[520px]"
        />
      </div>

      <div class="mt-3.5 flex max-w-[96ch] flex-col gap-1.5 text-[12.5px] text-muted-strong">
        <p class="border-l-2 border-line py-px pl-2.5">{{ t(w('administrators')) }}</p>
        <p class="border-l-2 border-line py-px pl-2.5">{{ t(w('noSetup')) }}</p>
      </div>

      <p v-if="!people.services.length" role="alert" class="mt-3 text-[13px] text-status-late-fg">{{ t(w('noVocabulary')) }}</p>
      <p v-if="people.fields === null" class="mt-3 text-[12.5px] text-muted-strong" data-note="fields-unread">{{ t(w('fieldsUnread')) }}</p>

      <p v-if="changes" role="status" class="mt-3.5 text-[13px] text-status-blocked-fg" data-note="unsaved">
        {{ t(w('pending'), { n: changes }, changes) }}
      </p>

      <details
        v-for="g in groups"
        :key="g.key"
        class="mt-3 overflow-hidden rounded-card border border-line bg-surface"
        :open="tickedIn(g) > 0 || g.key.startsWith('fields-')"
      >
        <summary class="cursor-pointer px-[18px] py-3">
          <span class="text-[14.5px] font-semibold">{{ g.title }}</span>
          <small class="ml-3 font-mono text-[11.5px] font-normal" :class="tickedIn(g) > 0 ? 'text-status-ontrack-fg' : 'text-muted'">
            {{ t(w('ticked'), { n: tickedIn(g), of: g.boxes.length }) }}
          </small>
        </summary>
        <label
          v-for="b in g.boxes"
          :key="b.name"
          class="flex items-start gap-2.5 border-t border-line px-[18px] py-[9px] text-[13.5px]"
          :class="fresh(b) ? 'bg-status-ontrack-bg/20' : ''"
          :data-box="b.name"
        >
          <input type="checkbox" class="mt-1" :checked="ticked.has(b.name)" @change="tick(b, ($event.target as HTMLInputElement).checked)" />
          <span class="min-w-0">
            {{ boxLabel(b) }}
            <small v-if="b.retired" class="ml-1 text-faint">{{ t(w('retired')) }}</small>
            <span
              v-if="guard(b)"
              class="mt-1 block rounded-chip border border-status-approaching-border bg-status-approaching-bg px-2 py-1 text-[12.5px] text-status-approaching-fg"
              data-guard
            >
              {{ guard(b) }}
            </span>
          </span>
        </label>
      </details>
    </template>
  </div>
</template>
