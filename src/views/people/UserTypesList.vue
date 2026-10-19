<script setup lang="ts">
// User types: the one thing every person holds, named after the job, as a list
// whose rows each open a page of their own. A user type carries boxes granted
// across the whole workspace only. Under the list, what someone arriving through
// the workspace's corporate login gets, applied once at their first sign-in.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { buttonVariants, Chip, ListTable, SelectField, StatusPill, type ListColumn, type SelectOption } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { PEOPLE_USER_TYPE, PEOPLE_USER_TYPE_NEW } from '../../routes'
import { usePeople, type UserType } from '../../stores/people'
import { useBoxes } from './useBoxes'

const { t } = useI18n()
const people = usePeople()
const { typeWords } = useBoxes()
const w = (key: string) => `configbyte.people.types.${key}`

// The chart says which positions give a user type, for the marks on each row.
onMounted(() => void people.ensurePositions())

const columns = computed<ListColumn[]>(() => [
  { key: 'name', label: t(w('columns.type')), priority: 1, width: 'minmax(240px,520px)' },
  { key: 'holds', label: t(w('columns.holds')), width: '230px' },
  { key: 'flags', label: '', width: 'minmax(200px,380px)' },
])

const link = (u: UserType) => ({ to: { name: PEOPLE_USER_TYPE, params: { id: u.id } } })
const givenBy = (u: UserType) => people.positions.filter((p) => p.userTypeId === u.id).map((p) => p.name)

const corporate = computed(() => people.userTypes.find((u) => u.corporateLoginDefault)?.id ?? '')
const corporateOptions = computed<SelectOption[]>(() => [
  { value: '', label: t(w('corporate.default'), { type: people.workspaceDefault?.name ?? '' }) },
  ...people.userTypes.filter((u) => !u.workspaceDefault).map((u) => ({ value: u.id, label: u.name })),
])

// A refused change leaves the select on what it held, which the select does on its own.
const onCorporate = (id: string) => void people.setCorporateLogin(id)
</script>

<template>
  <div class="mt-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <p class="max-w-[84ch] text-[13.5px] text-muted-strong">{{ t(w('lead')) }}</p>
      <RouterLink :to="{ name: PEOPLE_USER_TYPE_NEW }" :class="buttonVariants()" data-act="add-type">{{ t(w('form.add')) }}</RouterLink>
    </div>

    <SaidLine v-if="people.said" :said="people.said" class="mt-3.5" />

    <ListTable
      class="mt-3.5"
      :columns="columns"
      :rows="people.userTypes"
      :row-key="(u) => u.id"
      :label="t('configbyte.people.tabs.types')"
      :row-link="link"
      :link-component="RouterLink"
    >
      <template #cell-name="{ row }">
        <b class="font-semibold">{{ row.name }}</b>
        <small v-if="row.description" class="block text-[12.5px] text-muted">{{ row.description }}</small>
      </template>
      <template #cell-holds="{ row }">
        <span class="inline-flex flex-wrap items-center gap-1">
          <Chip v-for="(word, at) in typeWords(row.permissions)" :key="`${at}:${word}`">{{ word }}</Chip>
          <span v-if="!row.permissions.length" class="text-faint">{{ t(w('nothing')) }}</span>
        </span>
      </template>
      <template #cell-flags="{ row }">
        <span class="inline-flex flex-wrap items-center gap-1">
          <StatusPill v-if="row.workspaceDefault" size="sm" status="ontrack" :label="t(w('marks.default'))" />
          <StatusPill v-if="row.corporateLoginDefault" size="sm" status="closed" :label="t(w('marks.corporate'))" />
          <StatusPill v-if="givenBy(row).length" size="sm" status="closed" :label="t(w('marks.chart'), { positions: givenBy(row).join(', ') })" />
        </span>
      </template>
    </ListTable>

    <!-- What the corporate login gives a newcomer, once. -->
    <div class="mt-4 rounded-card border border-line bg-surface px-[18px] py-3" data-block="corporate">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label class="font-semibold" for="corporate-login">{{ t(w('corporate.label')) }}</label>
        <SelectField
          id="corporate-login"
          :model-value="corporate"
          :options="corporateOptions"
          size="sm"
          class="w-auto min-w-[180px]"
          @update:model-value="onCorporate"
        />
      </div>
      <p class="mt-1.5 text-[12.5px] text-muted-strong">{{ t(w('corporate.note')) }}</p>
    </div>
  </div>
</template>
