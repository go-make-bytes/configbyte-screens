<script setup lang="ts">
// User types: the one thing every person holds, named after the job. A user type
// carries boxes granted across the whole workspace only. Under the list, what
// someone arriving through the workspace's corporate login gets — applied once,
// at their first sign-in.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { groupBoxes, wholeSet, type Box } from '../../lib/boxes'
import { usePeople, type UserType } from '../../stores/people'
import { useAdminSession } from '../../stores/session'

const { t, locale } = useI18n()
const session = useAdminSession()
const people = usePeople()
const w = (key: string) => `configbyte.people.types.${key}`

const has = computed(() => new Set(Object.values(session.me?.sections ?? {}).flat()))

/** Every box a user type can hold, with its words, for the list and the form. */
function boxesFor(holds: string[]): Box[] {
  return groupBoxes({ services: people.services, use: 'userType', lang: locale.value, has: has.value, holds: new Set(holds), groups: [], fields: [] }).flatMap(
    (g) => g.boxes,
  )
}

function holdsWords(u: UserType): string[] {
  const words = new Map(boxesFor(u.permissions).map((b) => [b.name, b.label]))

  return u.permissions.map((p) => words.get(p) ?? p)
}

/** The form: a user type being edited, or a new one. */
const editing = ref<{ id: string; name: string; description: string; ticked: Set<string>; held: string[] } | null>(null)
const formBoxes = computed(() => (editing.value ? boxesFor(editing.value.held) : []))

function edit(u?: UserType) {
  people.said = null
  editing.value = u
    ? { id: u.id, name: u.name, description: u.description, ticked: new Set(u.permissions), held: [...u.permissions] }
    : { id: '', name: '', description: '', ticked: new Set(), held: [] }
}

function tick(name: string, on: boolean) {
  if (!editing.value) return
  const next = new Set(editing.value.ticked)
  if (on) next.add(name)
  else next.delete(name)
  editing.value.ticked = next
}

async function save() {
  const e = editing.value
  if (!e || e.name.trim() === '') return
  const permissions = wholeSet({
    shown: new Set(formBoxes.value.map((b) => b.name)),
    ticked: e.ticked,
    held: e.held,
    fieldBoxes: null,
    families: new Set(),
  })
  if (await people.saveUserType({ id: e.id, name: e.name.trim(), description: e.description.trim(), permissions })) editing.value = null
}

async function remove(u: UserType) {
  if (await people.deleteUserType(u)) editing.value = null
}

const corporate = computed(() => people.userTypes.find((u) => u.corporateLoginDefault)?.id ?? '')

async function onCorporate(event: Event) {
  const select = event.target as HTMLSelectElement
  const ok = await people.setCorporateLogin(select.value)
  if (!ok) select.value = corporate.value
}
</script>

<template>
  <div class="mt-5">
    <p class="max-w-3xl text-[13.5px] text-muted-strong">{{ t(w('lead')) }}</p>

    <div class="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
      <table class="w-full text-left text-[13.5px]">
        <thead class="border-b border-line text-[11.5px] uppercase tracking-wide text-faint">
          <tr>
            <th class="px-3 py-2 font-medium">{{ t(w('columns.type')) }}</th>
            <th class="px-3 py-2 font-medium">{{ t(w('columns.holds')) }}</th>
            <th class="px-3 py-2 font-medium">{{ t(w('columns.people')) }}</th>
            <th class="px-3 py-2"><span class="sr-only">{{ t(w('columns.acts')) }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in people.userTypes" :key="u.id" :data-type="u.id" class="border-b border-line last:border-0">
            <td class="px-3 py-2">
              <span class="font-semibold">{{ u.name }}</span>
              <span v-if="u.description" class="block text-[12px] text-muted-strong">{{ u.description }}</span>
              <span v-if="u.workspaceDefault" class="block text-[12px] text-faint">{{ t(w('marks.default')) }}</span>
              <span v-if="u.corporateLoginDefault" class="block text-[12px] text-faint">{{ t(w('marks.corporate')) }}</span>
            </td>
            <td class="px-3 py-2">
              <span v-for="word in holdsWords(u)" :key="word" class="mr-1 rounded-full border border-line px-2 py-0.5 text-[12px]">{{ word }}</span>
              <span v-if="!u.permissions.length" class="text-faint">{{ t(w('nothing')) }}</span>
            </td>
            <td class="px-3 py-2">{{ u.members }}</td>
            <td class="whitespace-nowrap px-3 py-2 text-right">
              <Button size="sm" variant="outline" @click="edit(u)">{{ t(w('edit')) }}</Button>
              <Button size="sm" variant="outline" class="ml-1 text-status-late-fg" :data-act="`delete-type-${u.id}`" @click="remove(u)">{{ t(w('delete')) }}</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-3">
      <Button size="sm" data-act="add-type" @click="edit()">{{ t(w('form.add')) }}</Button>
    </div>
    <SaidLine v-if="people.said && !editing" :said="people.said" />

    <!-- What the corporate login gives a newcomer, once. -->
    <div class="mt-5 rounded-card border border-line bg-band px-4 py-3" data-block="corporate">
      <label class="font-semibold" for="corporate-login">{{ t(w('corporate.label')) }}</label>
      <select id="corporate-login" class="ml-2 rounded-lg border border-line px-2 py-1 text-[13.5px]" :value="corporate" @change="onCorporate">
        <option value="">{{ t(w('corporate.default'), { type: people.workspaceDefault?.name ?? '' }) }}</option>
        <option v-for="u in people.userTypes.filter((x) => !x.workspaceDefault)" :key="u.id" :value="u.id">{{ u.name }}</option>
      </select>
      <p class="mt-1.5 text-[12.5px] text-muted-strong">{{ t(w('corporate.note')) }}</p>
    </div>

    <section v-if="editing" class="mt-5 rounded-card border border-line bg-surface px-5 py-4" data-type-form>
      <h3 class="font-semibold">{{ editing.id ? t(w('form.edit'), { type: editing.name }) : t(w('form.add')) }}</h3>
      <div class="mt-3 flex flex-wrap gap-3">
        <label class="text-[12.5px] text-muted-strong">
          {{ t(w('form.name')) }}
          <input v-model="editing.name" class="mt-1 block rounded-lg border border-line px-3 py-1.5 text-[14px] text-ink" />
        </label>
        <label class="min-w-64 flex-1 text-[12.5px] text-muted-strong">
          {{ t(w('form.for')) }}
          <input v-model="editing.description" class="mt-1 block w-full rounded-lg border border-line px-3 py-1.5 text-[14px] text-ink" />
        </label>
      </div>
      <p class="mt-3 text-[12.5px] text-muted-strong">{{ t(w('form.holds')) }}</p>
      <label v-for="b in formBoxes" :key="b.name" class="mt-1.5 flex items-center gap-2 text-[13.5px]" :data-box="b.name">
        <input type="checkbox" :checked="editing.ticked.has(b.name)" @change="tick(b.name, ($event.target as HTMLInputElement).checked)" />
        {{ b.label }}
      </label>
      <div class="mt-4 flex flex-wrap gap-2">
        <Button size="sm" :disabled="editing.name.trim() === ''" data-act="save-type" @click="save">{{ t(w('form.save')) }}</Button>
        <Button size="sm" variant="outline" @click="editing = null; people.said = null">{{ t(w('form.cancel')) }}</Button>
      </div>
      <SaidLine v-if="people.said" :said="people.said" />
    </section>
  </div>
</template>
