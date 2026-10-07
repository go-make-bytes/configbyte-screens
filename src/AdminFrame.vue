<script setup lang="ts">
// The admin app's frame: who is signed in, the entries this deployment has in
// their groups, and the states that have no screen of their own — the app closed
// to this person, someone who configures nothing here, and a coordinator that is
// not answering.
//
// An entry shows when two things are true: its screen was built into this app,
// and the coordinator found its section's owner at start. What the frame offers
// is display; every call is judged by the service it reaches.
import { computed, onMounted, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { AppShell, Button, buttonVariants, type NavGroup, type NavItem, type ShellLabels } from 'uibyte'

import AdminBrand from './components/AdminBrand.vue'
import AdminSignIn from './components/AdminSignIn.vue'
import { takeSignedOut, wayName } from './lib/signin'
import { useAdminOptions } from './options'
import { EXPORT_IMPORT, HISTORY, PEOPLE_ACCESS } from './routes'
import { useAdminSession } from './stores/session'

const { t, locale, availableLocales } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const f = (key: string) => `configbyte.frame.${key}`

onMounted(() => {
  session.readMarker(new URLSearchParams(window.location.search).get('error') ?? '')
  if (takeSignedOut()) session.message = 'signedOut'
  void session.ask()
})

/** How the person signed in, by the way's own name — never the method's code. */
const signedInWith = computed(() => {
  const name = session.me ? wayName(session.ways, session.me.loginMethod) : undefined

  return name ? t(f('method'), { method: name }) : t(f('signedIn'))
})

/** The deployment's own name once someone is signed in; the product's before. */
const brandName = computed(() => session.me?.presentation.displayName || t(options.product))

// The deployment says which language it reads in, where this app carries it.
watchEffect(() => {
  const wanted = session.me?.presentation.locale
  if (wanted && availableLocales.includes(wanted)) locale.value = wanted
})

watchEffect(() => {
  document.title = t(f('tab'), { name: brandName.value })
})

/** Whether the person holds anything that configures a section this deployment runs. */
const configures = computed(() =>
  session.holdsAny(session.order.flatMap((name) => options.sections[name]?.configures ?? [])),
)

/** Whether the membership register's owner answered, so People & access has something to read. */
const registerRuns = computed(() => !!options.register && session.order.includes(options.register))

/**
 * The sidebar, in groups. The shared screens open the first group, followed by
 * any host screen that names no group of its own; the host's groups follow in
 * the order their first entry arrives.
 */
const groups = computed<NavGroup[]>(() => {
  if (!configures.value) return []

  const shared: NavItem[] = [
    { key: 'export-import', label: t(f('exportImport')), icon: 'doc', linkProps: { to: { name: EXPORT_IMPORT } } },
    { key: 'history', label: t(f('history')), icon: 'clock', linkProps: { to: { name: HISTORY } } },
  ]
  if (registerRuns.value) {
    shared.push({ key: 'people-access', label: t(f('peopleAccess')), icon: 'people', linkProps: { to: { name: PEOPLE_ACCESS } } })
  }
  const out: NavGroup[] = [{ key: 'configbyte-workspace', label: t(f('shell.workspace')), items: shared }]

  for (const e of options.entries ?? []) {
    if (!session.order.includes(e.section)) continue
    const locked = e.locked?.() ?? false
    const item: NavItem = {
      key: e.key,
      label: t(e.label),
      icon: e.icon ?? 'gear',
      ...(locked ? { locked: true, tag: t(f('notIncluded')) } : { linkProps: { to: { name: e.route } } }),
    }
    const home = e.group ? out.find((g) => g.key === e.group) : out[0]
    if (home) home.items.push(item)
    else out.push({ key: e.group!, label: t(e.group!), items: [item] })
  }

  return out
})

const labels = computed<ShellLabels>(() => ({
  skipToContent: t(f('shell.skipToContent')),
  openMenu: t(f('shell.openMenu')),
  menu: t(f('shell.menu')),
  close: t(f('shell.close')),
  primaryNav: t(f('shell.primaryNav')),
  locked: t(f('shell.locked')),
}))
</script>

<template>
  <template v-if="session.resolved">
    <!-- Signing in, and the pages that close the app before anyone is signed in. -->
    <AdminSignIn v-if="!session.unreachable && (session.closed || !session.me)">
      <template #mark="{ size }"><slot name="mark" :size="size" /></template>
    </AdminSignIn>

    <AppShell v-else :groups="groups" :labels="labels" :link-component="RouterLink">
      <template #brand>
        <AdminBrand :name="brandName">
          <template #default="{ size }"><slot name="mark" :size="size" /></template>
        </AdminBrand>
      </template>
      <template #brand-compact>
        <AdminBrand :name="brandName" tone="ink" :size="22">
          <template #default="{ size }"><slot name="mark" :size="size" /></template>
        </AdminBrand>
      </template>
      <template #brand-drawer>
        <AdminBrand :name="brandName">
          <template #default="{ size }"><slot name="mark" :size="size" /></template>
        </AdminBrand>
      </template>

      <template #sidebar-footer>
        <div v-if="session.me" class="flex flex-col gap-2 border-t border-console-line pt-3">
          <span class="min-w-0">
            <span class="block truncate text-[13.5px] font-semibold text-console-text">{{ session.me.name }}</span>
            <span class="block font-mono text-[10.5px] tracking-wide text-console-accent">
              {{ signedInWith }}
            </span>
          </span>
          <Button variant="ghost" size="sm" class="justify-start text-console-text hover:bg-white/[0.07]" @click="session.logout()">
            {{ t(f('logout')) }}
          </Button>
          <p v-if="session.signOutFailed" role="alert" class="text-[12px] text-status-late">{{ t(f('logoutFailed')) }}</p>
        </div>
      </template>

      <!-- The coordinator did not answer: nothing was changed, and the one way on is to ask again. -->
      <section v-if="session.unreachable" class="mx-auto max-w-xl px-8 py-16" data-state="unreachable">
        <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t(f('down.eyebrow')) }}</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t(f('down.title')) }}</h1>
        <p class="mt-3 text-muted-strong">{{ t(f('down.lead')) }}</p>
        <div class="mt-5">
          <Button variant="outline" @click="session.ask()">{{ t(f('down.again')) }}</Button>
        </div>
      </section>

      <!-- Signed in, and nothing here is theirs to configure: said plainly, not shown as an empty app. -->
      <section v-else-if="!configures" class="mx-auto max-w-xl px-8 py-16" data-state="nothing">
        <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t(f('nothing.eyebrow')) }}</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t(f('nothing.title')) }}</h1>
        <p class="mt-3 text-muted-strong">{{ t(f('nothing.lead'), { product: t(options.product) }) }}</p>
        <a v-if="session.appUrl" :href="session.appUrl" :class="[buttonVariants(), 'mt-5']" data-open-app>
          {{ t(f('signIn.open'), { product: t(options.product) }) }}
        </a>
      </section>

      <router-view v-else />
    </AppShell>
  </template>
</template>
