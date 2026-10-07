<script setup lang="ts">
// The admin app's sign-in, and the two pages that close the app to a person before
// anyone is signed in: the shared page, given the admin app's words and wired to
// the coordinator.
//
// The closing pages are the deployment's own settings, judged by the coordinator.
// From outside the networks it allows, no sign-in is offered, since none would be
// answered. After a sign-in weaker than it asks for, no session was made, and every
// way the deployment has is offered again: which ways count as strong is the
// authority's setting, not something this page knows, so the coordinator judges
// the next attempt as it judged this one.
//
// Before anyone is signed in the page speaks the language chosen in this browser,
// else the browser's own, else the deployment's; a choice made here is kept in
// this browser. After sign-in the workspace's language decides — the frame
// applies it.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, type LanguageOption } from 'uibyte'

import SignInPage from './SignInPage.vue'
import { keepLanguage, languageBeforeSignIn, type SignInWay } from '../lib/signin'
import { useAdminOptions } from '../options'
import { useAdminSession } from '../stores/session'

const { t, locale, availableLocales } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const w = (key: string, values: Record<string, unknown> = {}) => t(`configbyte.frame.signIn.${key}`, values)
const c = (key: string, values: Record<string, unknown> = {}) => t(`configbyte.frame.closed.${key}`, values)

const product = computed(() => t(options.product))
const closed = computed(() => session.closed)

/** Every language the app carries, each in its own name. */
const languages = computed<LanguageOption[]>(() =>
  availableLocales.map((code) => ({ code, name: t('configbyte.signIn.self', {}, { locale: code }) })),
)

// The page is drawn once the ways are read — an empty list before then is not "no
// way set up" — or at once when the network closes the app, which no way would pass.
const ready = computed(() => session.waysRead || closed.value === 'network')

// The language is settled when the page is first drawn, and again when the
// deployment's own arrives with the ways.
watch(
  () => [ready.value, session.deploymentLanguage] as const,
  ([shown]) => {
    if (shown) locale.value = languageBeforeSignIn(availableLocales, session.deploymentLanguage || locale.value)
  },
  { immediate: true },
)

const title = computed(() => (closed.value ? c(`${closed.value}.title`) : w('title')))
const lead = computed(() => (closed.value ? c(`${closed.value}.lead`, { product: product.value }) : w('lead', { product: product.value })))

/** The way to everyday work, where the deployment names it and the page is not asking for a stronger sign-in. */
const link = computed(() =>
  session.appUrl && closed.value !== 'assurance' ? { label: w('open', { product: product.value }), href: session.appUrl } : undefined,
)

function choose(code: string) {
  locale.value = code
  keepLanguage(code)
}

/** A way chosen on a closing page starts afresh on the sign-in, which says how it goes. */
function start(way: SignInWay) {
  if (closed.value) session.reopen()
  void session.start(way, locale.value)
}
</script>

<template>
  <SignInPage
    v-if="ready"
    :data-closed="closed || undefined"
    :product="product"
    :tag="w('tag')"
    :title="title"
    :lead="lead"
    :link="link"
    :ways="session.ways"
    :offers="closed !== 'network'"
    :explain="!closed"
    :languages="languages"
    :language="locale"
    :message="closed ? '' : session.message"
    :signed-out-of="w('signedOutOf')"
    :waiting-for="session.waitingFor"
    :software-missing="!closed && session.softwareMissing"
    @update:language="choose"
    @start="start"
  >
    <template #mark="{ size }"><slot name="mark" :size="size" /></template>
    <template v-if="closed === 'assurance'" #actions>
      <Button variant="outline" class="w-full" @click="session.reopen()">{{ c('back') }}</Button>
    </template>
  </SignInPage>
</template>
