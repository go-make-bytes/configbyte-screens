<script setup lang="ts">
// The admin app's frame: who is signed in, the entries this deployment has in
// their groups, and the states that have no screen of their own — the app closed
// to this person, someone who configures nothing here, and a coordinator that is
// not answering.
//
// An entry shows when two things are true: its screen was built into this app,
// and the coordinator found its section's owner at start. What the frame offers
// is display; every call is judged by the service it reaches.
//
// The deployment's own group is the one exception to "because a service runs": it is
// shown by the sign-in answer alone, to a person who manages a deployment that serves
// many companies, and it comes last. A person shown it who configures nothing else
// sees only it, and the app's first address opens its first entry.
//
// At the foot of the menu, above the person's name, a globe names the language
// the page speaks and changes it at once. The choice is the person's, kept for
// them by the coordinator; the language everyone here has is marked as that.
import { computed, onMounted, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  ActLine,
  AppShell,
  Button,
  buttonVariants,
  LanguageMenu,
  type LanguageOption,
  type NavGroup,
  type NavItem,
  type ShellLabels,
} from 'uibyte'

import AdminBrand from './components/AdminBrand.vue'
import AdminSignIn from './components/AdminSignIn.vue'
import FirstRun from './components/FirstRun.vue'
import SignInTab from './components/SignInTab.vue'
import { isSignInTab, ownAddress, takeReturn } from './lib/again'
import { whenSignInEnds } from './lib/api'
import { takeSignedOut, wayName } from './lib/signin'
import { useAdminOptions } from './options'
import { DEPLOYMENT_ADMINS, DEPLOYMENT_COMPANIES, DEPLOYMENT_SIGN_IN_TAB, EXPORT_IMPORT, HISTORY, PEOPLE_ACCESS } from './routes'
import { useDeployment } from './stores/deployment'
import { useAdminSession } from './stores/session'

const { t, locale, availableLocales } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const route = useRoute()
const router = useRouter()
const f = (key: string) => `configbyte.frame.${key}`

// A sign-in that ends while someone works is one page, the sign-in page saying so,
// never a failure on every screen that was reading. Any other failure stays where it happened.
whenSignInEnds(() => session.signInEnded())

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

// Signed in, the page speaks the person's own language, else the deployment's —
// the one the coordinator answers — where this app carries it.
watchEffect(() => {
  const wanted = session.me?.presentation.locale
  if (wanted && availableLocales.includes(wanted)) locale.value = wanted
})

// The document says which language the page is in, before sign-in and after, so a
// screen reader reads its words in that language.
watchEffect(() => {
  document.documentElement.lang = locale.value
})

/** Every language the app carries, each named in itself; the deployment's marked as the one everyone here has. */
const languages = computed<LanguageOption[]>(() =>
  availableLocales.map((code) => ({
    code,
    name: t('configbyte.signIn.self', {}, { locale: code }),
    ...(code === session.me?.presentation.deploymentLocale ? { note: t('configbyte.language.everyoneHere') } : {}),
  })),
)

/** A language picked at the globe: the page changes at once, and the person keeps it on every computer. */
function chooseLanguage(code: string) {
  void session.setLanguage(code)
}

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
  const out = configures.value ? workspaceGroups() : []
  if (session.managesDeployment) out.push(deploymentGroup())

  return out
})

/**
 * The deployment's own area, last: shown by the sign-in answer alone, to a person
 * who manages the deployment on one that serves many companies, whatever else they
 * configure or do not.
 */
function deploymentGroup(): NavGroup {
  return {
    key: 'configbyte-deployment',
    label: t(f('deployment.group')),
    items: [
      { key: 'deployment-companies', label: t(f('deployment.companies')), icon: 'grid', linkProps: { to: { name: DEPLOYMENT_COMPANIES } } },
      { key: 'deployment-admins', label: t(f('deployment.admins')), icon: 'shield', linkProps: { to: { name: DEPLOYMENT_ADMINS } } },
    ],
  }
}

/** The workspace's own groups: the shared screens, then the host's entries. */
function workspaceGroups(): NavGroup[] {
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
}

/**
 * The app's first address opens the shared screens' first entry. For a person shown
 * the deployment's group who configures nothing else, that entry is not theirs, so it
 * opens the companies instead; every other address opens as it is asked.
 */
const opensCompanies = computed(
  () =>
    !!session.me &&
    session.managesDeployment &&
    !configures.value &&
    route.name === EXPORT_IMPORT &&
    route.redirectedFrom?.path === '/',
)
watch(
  opensCompanies,
  (now) => {
    if (now) void router.replace({ name: DEPLOYMENT_COMPANIES })
  },
  { immediate: true },
)

/** This browser tab is a sign-in tab: opened at its own address, or marked as one when it went to sign in. */
const tabMark = isSignInTab()
const inTab = computed(() => route.name === DEPLOYMENT_SIGN_IN_TAB || tabMark)

/** The deployment's own company is still to be named, and this person is the one to do it: said before any menu. */
const firstRunOwed = computed(() => !!session.me && session.deployment?.firstRunOwed === true && !session.notAnswering)

// A sign-in that left the app for a part that wanted a recent one comes back to the address kept for it,
// when that is one of the app's own; anything else kept is dropped and the companies open. It is read once.
watch(
  () => session.resolved,
  (read) => {
    if (!read || inTab.value) return
    const kept = takeReturn()
    if (kept === null || !session.me || session.message) return
    const target = ownAddress(router, kept) ?? { name: DEPLOYMENT_COMPANIES }
    // Back from a sign-in that asked for a recent one: the area is not pre-judged again by the browser's clock.
    const name = router.resolve(target).name
    session.cameBack = typeof name === 'string' && name.startsWith('configbyte-deployment-')
    void router.replace(target)
  },
  { immediate: true },
)

// After the first run the sign-in answer is read again: on a deployment for many companies the app opens on the
// companies, and the line that the company is set up is kept over the first page that opens.
let keepFirstRunLine = false
watch(
  () => session.deployment?.firstRunOwed,
  (now, was) => {
    if (was !== true || now !== false) return
    if (session.managesDeployment) {
      keepFirstRunLine = true
      void router.replace({ name: DEPLOYMENT_COMPANIES })
    }
  },
)
watch(
  () => route.fullPath,
  () => {
    if (keepFirstRunLine) keepFirstRunLine = false
    else areaStore.firstRun = null
  },
)
// A person who stops managing the deployment is moved off its pages, to wherever the app opens for them now.
watch(
  () => session.managesDeployment,
  (now, was) => {
    if (was && !now && route.path.startsWith('/deployment/')) void router.replace('/')
  },
)

const areaStore = useDeployment()
const firstRunLine = computed(() => {
  const done = areaStore.firstRun
  if (!done) return ''
  const said = done.name ? t('configbyte.deployment.firstRun.done', { name: done.name }) : t('configbyte.deployment.firstRun.doneUnnamed')

  return done.missing ? `${said} ${t('configbyte.deployment.firstRun.doneMissing')}` : said
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
    <AdminSignIn v-if="!session.notAnswering && (session.closed || !session.me)">
      <template #mark="{ size }"><slot name="mark" :size="size" /></template>
    </AdminSignIn>

    <!-- A tab opened to sign in again is a page of its own, with the sign-in page's own words when it did not go well. -->
    <template v-else-if="inTab">
      <AdminSignIn v-if="session.message">
        <template #mark="{ size }"><slot name="mark" :size="size" /></template>
      </AdminSignIn>
      <SignInTab v-else>
        <template #mark="{ size }"><slot name="mark" :size="size" /></template>
      </SignInTab>
    </template>

    <!-- The first run: one question, before any menu. -->
    <FirstRun v-else-if="firstRunOwed">
      <template #mark="{ size }"><slot name="mark" :size="size" /></template>
    </FirstRun>

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

      <!-- The same foot is drawn at the bottom of the menu a phone opens: the globe first, then who is signed in. -->
      <template #sidebar-footer>
        <template v-if="session.me">
          <LanguageMenu
            side="top"
            tone="console"
            block
            :languages="languages"
            :model-value="locale"
            :label="t('configbyte.signIn.language')"
            @update:model-value="chooseLanguage"
          />
          <p v-if="session.languageFailed" role="alert" class="text-[12px] text-status-late">{{ t(f('languageFailed')) }}</p>
          <div class="flex flex-col gap-2 border-t border-console-line pt-3">
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
      </template>

      <!-- The first run was just done: said once, over whatever opens. -->
      <div v-if="firstRunLine" class="mx-auto max-w-5xl px-8 pt-6">
        <ActLine outcome="done" :text="firstRunLine" data-line="first-run" />
      </div>

      <!-- The coordinator did not answer: nothing was changed, and the one way on is to ask again. -->
      <section v-if="session.notAnswering" class="mx-auto max-w-xl px-8 py-16" data-state="unreachable">
        <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t(f('down.eyebrow')) }}</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t(f('down.title')) }}</h1>
        <p class="mt-3 text-muted-strong">{{ t(f('down.lead')) }}</p>
        <div class="mt-5">
          <Button variant="outline" @click="session.ask()">{{ t(f('down.again')) }}</Button>
        </div>
      </section>

      <!-- Signed in, and nothing here is theirs to configure: said plainly, not shown as an empty app. -->
      <section v-else-if="!configures && !session.managesDeployment" class="mx-auto max-w-xl px-8 py-16" data-state="nothing">
        <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t(f('nothing.eyebrow')) }}</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t(f('nothing.title')) }}</h1>
        <p class="mt-3 text-muted-strong">{{ t(f('nothing.lead'), { product: t(options.product) }) }}</p>
        <a v-if="session.appUrl" :href="session.appUrl" :class="[buttonVariants(), 'mt-5']" data-open-app>
          {{ t(f('signIn.open'), { product: t(options.product) }) }}
        </a>
      </section>

      <!-- The first address is on its way to the companies: nothing of the shared screens is drawn meanwhile. -->
      <template v-else-if="opensCompanies" />

      <router-view v-else />
    </AppShell>
  </template>
</template>
