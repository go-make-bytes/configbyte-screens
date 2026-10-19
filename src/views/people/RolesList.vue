<script setup lang="ts">
// Roles: the workspace's roles as a list, each opening a page of its own, and the
// host's settings that name one of them. Setting the workspace up is never a
// role's, so no role is offered it: it comes only with the Administrator checkbox.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { buttonVariants, ListTable, StatusPill, type ListColumn } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { useAdminOptions } from '../../options'
import { PEOPLE_ROLE, PEOPLE_ROLE_NEW } from '../../routes'
import { usePeople, type Role } from '../../stores/people'
import RoleSettings from './RoleSettings.vue'
import { useBoxes } from './useBoxes'

const { t } = useI18n()
const options = useAdminOptions()
const people = usePeople()
const { roleCounts } = useBoxes()
const w = (key: string) => `configbyte.people.roles.${key}`

// The count on each row includes the restricted fields' boxes, so they are read
// with the list: once a visit.
onMounted(() => void people.ensureFields(options.roles?.fields))

const columns = computed<ListColumn[]>(() => [
  { key: 'name', label: t(w('columns.role')), priority: 1, width: 'minmax(260px,640px)' },
  { key: 'boxes', label: t(w('columns.boxes')), width: '110px' },
  { key: 'kind', label: '', width: '110px' },
])

const link = (r: Role) => ({ to: { name: PEOPLE_ROLE, params: { id: r.id } } })
const boxes = (r: Role) => {
  const { n, of } = roleCounts(r)

  return t(w('boxesOf'), { n, m: of })
}
</script>

<template>
  <div class="mt-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <p class="max-w-[84ch] text-[13.5px] text-muted-strong">{{ t(w('lead')) }}</p>
      <RouterLink :to="{ name: PEOPLE_ROLE_NEW }" :class="buttonVariants()" data-act="new-role">{{ t(w('new')) }}</RouterLink>
    </div>

    <SaidLine v-if="people.said" :said="people.said" class="mt-3.5" />

    <p v-if="!people.fieldsSettled" role="status" class="mt-4 text-muted-strong">{{ t(w('reading')) }}</p>
    <ListTable
      v-else
      class="mt-3.5"
      :columns="columns"
      :rows="people.roles"
      :row-key="(r) => r.id"
      :label="t('configbyte.people.tabs.roles')"
      :row-link="link"
      :link-component="RouterLink"
    >
      <template #cell-name="{ row }">
        <b class="font-semibold">{{ row.name }}</b>
        <small v-if="row.description" class="block truncate text-[12.5px] text-muted">{{ row.description }}</small>
        <small v-else class="block text-[12.5px] italic text-muted">{{ t(w('noDescription')) }}</small>
      </template>
      <template #cell-boxes="{ row }">{{ boxes(row) }}</template>
      <template #cell-kind="{ row }">
        <StatusPill
          size="sm"
          :status="row.seed ? 'idle' : 'ontrack'"
          :label="t(row.seed ? w('pill.shipped') : w('pill.made'))"
        />
      </template>
    </ListTable>

    <div class="mt-3 flex max-w-[96ch] flex-col gap-1.5 text-[12.5px] text-muted-strong">
      <p class="border-l-2 border-line py-px pl-2.5">{{ t(w('administrators')) }}</p>
      <p class="border-l-2 border-line py-px pl-2.5">{{ t(w('noSetup')) }}</p>
    </div>

    <RoleSettings v-if="options.roles?.settings?.length" :settings="options.roles.settings" />
  </div>
</template>
