<script setup lang="ts">
// Shown when nobody is signed in to the admin app. These screens never handle a
// credential: each method asks the coordinator to begin, and what comes back is a
// cookie of its own, separate from the everyday app's session.
//
// Two methods, and they work differently on purpose. The redirect hands the
// browser to the authority and comes back to a registered address. The ID card
// never leaves this page: the card signs a challenge here, through the person's
// own card software.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'uibyte'

import { ApiError } from '../lib/api'
import { CARD_SOFTWARE_URL, isCardSoftwareMissing } from '../lib/webeid'
import { useAdminOptions } from '../options'
import { useAdminSession } from '../stores/session'
import AdminBrand from './AdminBrand.vue'

const { t, te, locale } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const w = (key: string) => `configbyte.frame.signIn.${key}`

const failed = ref('')
/** What the server said, shown beneath the sentence, never in its place. */
const failedReason = ref('')
const softwareMissing = ref(false)
const waitingForCard = ref(false)

/**
 * A sign-in that did not finish comes back as a marker on the address, because the
 * browser navigated away and has to land somewhere. An unknown marker still says
 * something rather than nothing.
 */
const marker = computed(() => new URLSearchParams(window.location.search).get('error') ?? '')

const markerMessage = computed(() => {
  if (!marker.value) return ''
  const key = w(`loginFailed.${marker.value}`)

  return te(key) ? t(key) : t(w('loginFailed.unknown'))
})

function clear() {
  failed.value = ''
  failedReason.value = ''
  softwareMissing.value = false
}

async function signIn() {
  clear()
  try {
    await session.login()
  } catch (e) {
    failed.value = e instanceof Error ? e.message : String(e)
  }
}

async function signInWithCard() {
  clear()
  waitingForCard.value = true
  try {
    await session.loginWithCard(locale.value)
  } catch (e) {
    // "The software is not installed" is a different thing to be told than "that
    // did not work": one is something to go and do.
    if (isCardSoftwareMissing(e)) {
      softwareMissing.value = true
    } else {
      failed.value = t(w('card.failed'))
      failedReason.value = e instanceof ApiError ? e.message : ''
    }
  } finally {
    waitingForCard.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-8">
    <AdminBrand :name="t(options.product)" tone="ink">
      <template #default="{ size }"><slot name="mark" :size="size" /></template>
    </AdminBrand>
    <h1 class="mt-6 text-3xl font-bold tracking-tight">{{ t(w('title')) }}</h1>
    <p class="mt-3 text-muted-strong">{{ t(w('lead'), { product: t(options.product) }) }}</p>

    <!-- A sign-in that came back unfinished says so before the buttons, because it
         is the answer to what the person just did. -->
    <p
      v-if="markerMessage"
      role="alert"
      class="mt-5 rounded-card border border-status-late-border bg-status-late-bg px-4 py-3 text-[13px] text-status-late-fg"
    >
      {{ markerMessage }}
    </p>

    <div class="mt-6 flex flex-wrap items-start gap-3">
      <Button :disabled="waitingForCard" @click="signInWithCard">
        {{ waitingForCard ? t(w('card.waiting')) : t(w('card.signIn')) }}
      </Button>
      <Button variant="outline" :disabled="waitingForCard" @click="signIn">
        {{ t(w('account')) }}
      </Button>
    </div>

    <!-- The card is read by software on this machine, so say what to expect. -->
    <p class="mt-4 text-[12.5px] text-faint">{{ t(w('card.hint')) }}</p>

    <!-- Missing software is not an error to apologise for; it is a step. -->
    <section v-if="softwareMissing" role="alert" class="mt-5 rounded-card border border-line bg-band px-4 py-4">
      <h2 class="text-[14px] font-semibold">{{ t(w('card.missing.title')) }}</h2>
      <p class="mt-2 text-[13px] text-muted-strong">{{ t(w('card.missing.lead')) }}</p>
      <a :href="CARD_SOFTWARE_URL" target="_blank" rel="noreferrer noopener" class="mt-3 inline-block text-[13px] font-semibold underline">
        {{ t(w('card.missing.action')) }}
      </a>
    </section>

    <div v-if="failed" role="alert" class="mt-4">
      <p class="font-mono text-[12px] text-status-late-fg">{{ failed }}</p>
      <!-- The reason as it was given to us, never paraphrased. -->
      <p v-if="failedReason" class="mt-1 font-mono text-[12px] text-muted-strong">{{ failedReason }}</p>
    </div>
  </main>
</template>
