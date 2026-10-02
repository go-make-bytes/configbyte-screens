<script setup lang="ts">
// The admin app's frame: who is signed in, the entries this deployment has, and
// the two states that have no screen of their own — someone who configures
// nothing here, and a coordinator that is not answering.
//
// An entry shows when two things are true: its screen was built into this app,
// and the coordinator found its section's owner at start. What the frame offers
// is display; every call is judged by the service it reaches.
import { computed, onMounted, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { AppShell, Button, type NavItem, type ShellLabels } from 'uibyte'

import AdminBrand from './components/AdminBrand.vue'
import SignInPage from './components/SignInPage.vue'
import { useAdminOptions } from './options'
import { EXPORT_IMPORT } from './routes'
import { useAdminSession } from './stores/session'

const { t, locale, availableLocales } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const f = (key: string) => `configbyte.frame.${key}`

onMounted(() => {
  void session.resolve()
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

const items = computed<NavItem[]>(() => {
  if (!configures.value) return []

  return [
    { key: 'export-import', label: t(f('exportImport')), icon: 'doc', linkProps: { to: { name: EXPORT_IMPORT } } },
    ...(options.entries ?? [])
      .filter((e) => session.order.includes(e.section))
      .map((e): NavItem => ({ key: e.key, label: t(e.label), icon: 'gear', linkProps: { to: { name: e.route } } })),
  ]
})

const labels = computed<ShellLabels>(() => ({
  skipToContent: t(f('shell.skipToContent')),
  openMenu: t(f('shell.openMenu')),
  menu: t(f('shell.menu')),
  close: t(f('shell.close')),
  primaryNav: t(f('shell.primaryNav')),
}))
</script>

<template>
  <template v-if="session.resolved">
    <SignInPage v-if="!session.me && !session.unreachable">
      <template #mark="{ size }"><slot name="mark" :size="size" /></template>
    </SignInPage>

    <AppShell v-else :items="items" :labels="labels" :link-component="RouterLink">
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
              {{ t(f('method'), { method: session.me.loginMethod }) }}
            </span>
          </span>
          <Button variant="ghost" size="sm" class="justify-start text-console-text hover:bg-white/[0.07]" @click="session.logout()">
            {{ t(f('logout')) }}
          </Button>
        </div>
      </template>

      <!-- The coordinator did not answer: nothing was changed, and the one way on is to ask again. -->
      <section v-if="session.unreachable" class="mx-auto max-w-xl px-8 py-16" data-state="unreachable">
        <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t(f('down.eyebrow')) }}</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t(f('down.title')) }}</h1>
        <p class="mt-3 text-muted-strong">{{ t(f('down.lead')) }}</p>
        <div class="mt-5">
          <Button variant="outline" @click="session.resolve()">{{ t(f('down.again')) }}</Button>
        </div>
      </section>

      <!-- Signed in, and nothing here is theirs to configure: said plainly, not shown as an empty app. -->
      <section v-else-if="!configures" class="mx-auto max-w-xl px-8 py-16" data-state="nothing">
        <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t(f('nothing.eyebrow')) }}</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t(f('nothing.title')) }}</h1>
        <p class="mt-3 text-muted-strong">{{ t(f('nothing.lead'), { product: t(options.product) }) }}</p>
      </section>

      <router-view v-else />
    </AppShell>
  </template>
</template>
