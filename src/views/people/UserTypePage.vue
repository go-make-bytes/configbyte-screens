<script setup lang="ts">
// One user type, on a page of its own: its name, what it is for, and the boxes it
// holds, which are those granted across the whole workspace only. Delete is
// inside the page, and the register refuses it with the reason while the type is
// held, is what the corporate login gives, or is given by a position in the chart.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { Button, buttonVariants, PageHeader, TextField } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { wholeSet } from '../../lib/boxes'
import { PEOPLE_USER_TYPE, PEOPLE_USER_TYPES } from '../../routes'
import { usePeople } from '../../stores/people'
import { useBoxes } from './useBoxes'

/** The user type open: its id, or empty for one being made. */
const props = defineProps<{ typeId: string }>()

const { t } = useI18n()
const people = usePeople()
const router = useRouter()
const { typeBoxes } = useBoxes()
const w = (key: string) => `configbyte.people.types.${key}`

const creating = computed(() => props.typeId === '')
const type = computed(() => (creating.value ? undefined : people.userTypes.find((u) => u.id === props.typeId)))

/** Every box a user type can hold, with its words. */
const boxes = computed(() => typeBoxes(type.value?.permissions ?? []))

const name = ref('')
const description = ref('')
const ticked = ref(new Set<string>())

function reset() {
  name.value = type.value?.name ?? ''
  description.value = type.value?.description ?? ''
  ticked.value = new Set(type.value?.permissions ?? [])
}
watch(() => props.typeId, reset, { immediate: true })

// Another user type opened: nothing said about the last one stays. One just made keeps the line that says so.
watch(
  () => props.typeId,
  (_now, was) => {
    if (was !== '') people.said = null
  },
)

// The chart says which positions give this user type.
onMounted(() => {
  people.said = null
  void people.ensurePositions()
})

const givenBy = computed(() => people.positions.filter((p) => p.userTypeId === props.typeId).map((p) => p.name))

function tick(box: string, on: boolean) {
  const next = new Set(ticked.value)
  if (on) next.add(box)
  else next.delete(box)
  ticked.value = next
}

async function save() {
  if (name.value.trim() === '') return
  const permissions = wholeSet({
    shown: new Set(boxes.value.map((b) => b.name)),
    ticked: ticked.value,
    held: type.value?.permissions ?? [],
    fieldBoxes: null,
    families: new Set(),
  })
  const id = await people.saveUserType({
    id: type.value?.id ?? '',
    name: name.value.trim(),
    was: type.value?.name ?? '',
    description: description.value.trim(),
    permissions,
  })
  if (id && creating.value) await router.replace({ name: PEOPLE_USER_TYPE, params: { id } })
}

async function remove() {
  if (type.value && (await people.deleteUserType(type.value))) await router.push({ name: PEOPLE_USER_TYPES })
}
</script>

<template>
  <div class="mt-5 max-w-[1040px]" data-type-form>
    <PageHeader
      :level="2"
      :title="creating ? t(w('form.add')) : (type?.name ?? '')"
      :back="{ label: t('configbyte.people.tabs.types'), linkProps: { to: { name: PEOPLE_USER_TYPES } } }"
      :link-component="RouterLink"
    />

    <div class="mt-3.5 flex flex-wrap items-center gap-2">
      <Button size="sm" :disabled="name.trim() === ''" data-act="save-type" @click="save">{{ t(w('form.save')) }}</Button>
      <RouterLink :to="{ name: PEOPLE_USER_TYPES }" :class="buttonVariants({ variant: 'outline', size: 'sm' })">{{ t(w('form.cancel')) }}</RouterLink>
      <Button v-if="type && !type.workspaceDefault" size="sm" variant="outline" class="text-status-late-fg" data-act="delete-type" @click="remove">
        {{ t(w('delete')) }}
      </Button>
    </div>

    <SaidLine v-if="people.said" :said="people.said" class="mt-3" />

    <div class="mt-4 grid gap-3.5 rounded-card border border-line bg-surface px-[18px] py-4">
      <TextField id="type-name" v-model="name" :label="t(w('form.name'))" :placeholder="t(w('form.namePlaceholder'))" class="max-w-[520px]" />
      <TextField id="type-for" v-model="description" :label="t(w('form.for'))" :placeholder="t(w('form.forPlaceholder'))" class="max-w-[520px]" />
      <fieldset>
        <legend class="mb-1 text-[13px] text-muted-strong">{{ t(w('form.holds')) }}</legend>
        <label v-for="b in boxes" :key="b.name" class="mt-1.5 flex items-start gap-2 text-[13.5px]" :data-box="b.name">
          <input type="checkbox" class="mt-1" :checked="ticked.has(b.name)" @change="tick(b.name, ($event.target as HTMLInputElement).checked)" />
          <span>{{ b.label }}</span>
        </label>
      </fieldset>
    </div>

    <p v-if="givenBy.length" class="mt-3.5 text-[13px] text-muted-strong" data-note="chart-gives">
      {{ t(w('chartGives'), { positions: givenBy.join(', ') }) }}
    </p>
    <p v-if="type?.workspaceDefault" class="mt-3.5 max-w-[96ch] border-l-2 border-line py-px pl-2.5 text-[12.5px] text-muted-strong" data-note="default">
      {{ t(w('defaultKeeps')) }}
    </p>
  </div>
</template>
