<script setup lang="ts">
// People & access: who is in the workspace and what each person holds across it,
// the workspace's own roles and their boxes, and its user types. Everything is
// read from and written to the membership register through the coordinator; the
// register judges every act.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tabs, type TabItem } from 'uibyte'

import { useAdminOptions } from '../options'
import { usePeople } from '../stores/people'
import { useAdminSession } from '../stores/session'
import RolesTab from './people/RolesTab.vue'
import UsersTab from './people/UsersTab.vue'
import UserTypesTab from './people/UserTypesTab.vue'

const { t } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const people = usePeople()
const w = (key: string) => `configbyte.people.${key}`

const tab = ref('users')
const tabs = computed<TabItem[]>(() => [
  { key: 'users', label: t(w('tabs.users')) },
  { key: 'roles', label: t(w('tabs.roles')) },
  { key: 'types', label: t(w('tabs.types')) },
])

function choose(key: string) {
  tab.value = key
  people.said = null
}

onMounted(() => {
  if (!options.register || !session.me) return
  void people.load({ section: options.register, tenant: session.me.tenant, fields: options.roles?.fields })
})
</script>

<template>
  <section class="mx-auto max-w-6xl px-8 py-8">
    <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t('configbyte.frame.shell.workspace') }}</p>
    <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t(w('title')) }}</h1>
    <p class="mt-2 max-w-3xl text-muted-strong">{{ t(w('lead')) }}</p>

    <Tabs class="mt-5" :tabs="tabs" :model-value="tab" :label="t(w('title'))" @update:model-value="choose" />

    <p v-if="people.loading && !people.loaded" role="status" class="mt-6 text-muted-strong">{{ t(w('loading')) }}</p>
    <p v-else-if="people.failed" role="alert" class="mt-6 text-status-late-fg" data-state="failed">
      {{ t(w('failed'), { reason: people.failed }) }}
    </p>
    <template v-else-if="people.loaded">
      <UsersTab v-if="tab === 'users'" />
      <RolesTab v-else-if="tab === 'roles'" />
      <UserTypesTab v-else />
    </template>
  </section>
</template>
