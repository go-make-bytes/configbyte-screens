<script setup lang="ts">
// People & access: who is in the workspace and what each person holds across it,
// the workspace's own roles and their boxes, and its user types. Everything is
// read from and written to the membership register through the coordinator; the
// register judges every act.
//
// What is open lives in the address: a tab, and a person, a role or a user type
// within it, so a link, a refresh and Back keep it. The lists are read once a
// visit, and an act reads again only the list it changed.
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { PageHeader, Tabs, type TabItem } from 'uibyte'

import { useAdminOptions } from '../options'
import {
  PEOPLE_ACCESS,
  PEOPLE_ROLE,
  PEOPLE_ROLE_NEW,
  PEOPLE_ROLES,
  PEOPLE_USER,
  PEOPLE_USER_TYPE,
  PEOPLE_USER_TYPE_NEW,
  PEOPLE_USER_TYPES,
} from '../routes'
import { usePeople } from '../stores/people'
import { useAdminSession } from '../stores/session'
import RolePage from './people/RolePage.vue'
import RolesList from './people/RolesList.vue'
import UsersList from './people/UsersList.vue'
import UserTypePage from './people/UserTypePage.vue'
import UserTypesList from './people/UserTypesList.vue'

const { t } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const people = usePeople()
const route = useRoute()
const router = useRouter()
const w = (key: string) => `configbyte.people.${key}`

type Tab = 'users' | 'roles' | 'types'
type Place = 'users' | 'user' | 'roles' | 'role' | 'types' | 'type'

const first = (value: unknown) => String((Array.isArray(value) ? value[0] : value) ?? '')
const id = computed(() => first(route.params.id))

/** Where in People & access the address is. */
const place = computed<Place>(() => {
  switch (route.name) {
    case PEOPLE_USER:
      return 'user'
    case PEOPLE_ROLES:
      return 'roles'
    case PEOPLE_ROLE:
    case PEOPLE_ROLE_NEW:
      return 'role'
    case PEOPLE_USER_TYPES:
      return 'types'
    case PEOPLE_USER_TYPE:
    case PEOPLE_USER_TYPE_NEW:
      return 'type'
    default:
      return 'users'
  }
})
const tab = computed<Tab>(() => ({ users: 'users', user: 'users', roles: 'roles', role: 'roles', types: 'types', type: 'types' })[place.value] as Tab)

/** The people whose access is not revoked: persons, never the services acting here. */
const present = computed(() => people.people.filter((m) => m.status !== 'revoked').length)
/** A count is said only once the lists are read. */
const tag = (n: number) => (people.loaded ? String(n) : undefined)

const tabs = computed<TabItem[]>(() => [
  { key: 'users', label: t(w('tabs.users')), tag: tag(present.value) },
  { key: 'roles', label: t(w('tabs.roles')), tag: tag(people.roles.length) },
  { key: 'types', label: t(w('tabs.types')), tag: tag(people.userTypes.length) },
])

const lists: Record<Tab, string> = { users: PEOPLE_ACCESS, roles: PEOPLE_ROLES, types: PEOPLE_USER_TYPES }

function choose(key: string) {
  people.said = null
  void router.push({ name: lists[key as Tab] })
}

/**
 * The tabs say nothing when the chosen one is pressed, yet from a person's, a
 * role's or a user type's page that press means the tab's list. Enter and Space
 * on a tab fire a click too, so this hears them all.
 */
function pressed(ev: MouseEvent) {
  const button = (ev.target as Element | null)?.closest?.('[role="tab"]')
  if (!button || button.getAttribute('aria-selected') !== 'true') return
  if (place.value !== 'user' && place.value !== 'role' && place.value !== 'type') return
  choose(tab.value)
}

/** Why the people could not be read, in words: never a code, never an exception's text. */
const failure = computed(() => {
  switch (people.failed) {
    case 'unanswered':
      return t(w('failedUnanswered'))
    case 'notAdministrator':
      return t(w('refused.notAdministrator'))
    default:
      return people.failedReason ? t(w('failed'), { reason: people.failedReason }) : t(w('failedPlain'))
  }
})

/** Everyone not revoked, the administrators among them, and the services acting here. */
const counts = computed(() => {
  const administrators = people.administrators.filter((m) => m.kind === 'person').length
  const services = people.machines.length

  return [
    t(w('head.people'), { n: present.value }, present.value),
    t(w('head.administrators'), { n: administrators }, administrators),
    t(w('head.services'), { n: services }, services),
  ].join(' · ')
})

// An address naming something the lists do not hold opens the list it belongs to.
watch(
  [() => people.loaded, place, id],
  () => {
    if (!people.loaded) return
    if (place.value === 'user' && !people.people.some((m) => m.id === id.value)) void router.replace({ name: PEOPLE_ACCESS })
    else if (place.value === 'role' && route.name === PEOPLE_ROLE && !people.roles.some((r) => r.id === id.value)) {
      void router.replace({ name: PEOPLE_ROLES })
    } else if (place.value === 'type' && route.name === PEOPLE_USER_TYPE && !people.userTypes.some((u) => u.id === id.value)) {
      void router.replace({ name: PEOPLE_USER_TYPES })
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (!options.register || !session.me) return
  people.said = null
  void people.open({ section: options.register, tenant: session.me.tenant })
})
</script>

<template>
  <section class="@container/page mx-auto max-w-6xl px-8 py-8">
    <PageHeader
      :eyebrow="t('configbyte.frame.shell.workspace')"
      :title="t(w('title'))"
      :subtitle="people.loaded && !people.failed ? counts : undefined"
    />

    <Tabs class="mt-5" :tabs="tabs" :model-value="tab" :label="t(w('title'))" @update:model-value="choose" @click="pressed" />

    <p v-if="people.loading && !people.loaded" role="status" class="mt-6 text-muted-strong">{{ t(w('loading')) }}</p>
    <p v-else-if="people.failed" role="alert" class="mt-6 text-status-late-fg" data-state="failed">
      {{ failure }}
    </p>
    <template v-else-if="people.loaded">
      <UsersList v-if="place === 'users' || place === 'user'" :open-id="place === 'user' ? id : ''" />
      <RolesList v-else-if="place === 'roles'" />
      <RolePage v-else-if="place === 'role'" :role-id="route.name === PEOPLE_ROLE ? id : ''" />
      <UserTypesList v-else-if="place === 'types'" />
      <UserTypePage v-else :type-id="route.name === PEOPLE_USER_TYPE ? id : ''" />
    </template>
  </section>
</template>
