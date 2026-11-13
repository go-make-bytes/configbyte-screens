<script setup lang="ts">
// The sign-in tab: the admin app at an address of its own, opened from a page of the
// deployment's area that needs a recent sign-in and must keep what its person typed.
// Opened at that address it marks itself as a sign-in tab and starts the same recent
// sign-in at once, the way the person used; where that way is no longer offered it
// offers the ways. When the sign-in comes back it says so, tells the other tabs of this
// browser, and shows nothing else: no menu, and no call of the area. Closing it is the
// person's act.
//
// The tab's session storage holds the one mark that says it is a sign-in tab.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Button } from 'uibyte'

import AdminBrand from './AdminBrand.vue'
import { clearSignInTab, markSignInTab, SIGN_IN_CHANNEL } from '../lib/again'
import type { SignInWay } from '../lib/signin'
import { useAdminOptions } from '../options'
import { DEPLOYMENT_SIGN_IN_TAB } from '../routes'
import { useAdminSession } from '../stores/session'

const { t } = useI18n()
const route = useRoute()
const session = useAdminSession()
const options = useAdminOptions()
const w = (key: string) => `configbyte.deployment.tab.${key}`

// Settled as the tab opens: at its own address it is starting a sign-in; anywhere else it has come back from one.
const starting = ref(route.name === DEPLOYMENT_SIGN_IN_TAB)
const brand = computed(() => session.me?.presentation.displayName || t(options.product))
const offered = computed(() => starting.value && session.waysRead && !session.ways.some((way) => way.key === session.me?.loginMethod))

function begin(way: SignInWay) {
  void session.start(way, true)
}

onMounted(async () => {
  if (starting.value) {
    markSignInTab()
    await session.readWays()
    const used = session.ways.find((way) => way.key === session.me?.loginMethod)
    if (used) begin(used)

    return
  }
  try {
    const channel = new BroadcastChannel(SIGN_IN_CHANNEL)
    channel.postMessage('signed-in')
    channel.close()
  } catch {
    // The page that opened this tab reads who is signed in when it is looked at again.
  }
  // It has said it is signed in again: the mark goes, so the tab keeps nothing.
  clearSignInTab()
})
</script>

<template>
  <main class="@container/page mx-auto flex min-h-screen max-w-[520px] flex-col justify-center gap-4 px-6 py-10" data-page="sign-in-tab" :data-state="starting ? 'starting' : 'done'">
    <AdminBrand :name="brand" tone="ink">
      <template #default="{ size }"><slot name="mark" :size="size" /></template>
    </AdminBrand>
    <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{{ t(w('eyebrow')) }}</p>
    <template v-if="starting">
      <h1 class="text-[26px] font-bold tracking-tight">{{ t(w('startingTitle')) }}</h1>
      <p class="text-[13.5px] text-muted-strong" role="status">{{ t(w(offered ? 'chooseWay' : 'startingLead')) }}</p>
      <div v-if="offered" class="flex flex-wrap gap-2.5">
        <Button v-for="way in session.ways" :key="way.key" :data-way="way.key" @click="begin(way)">{{ way.name }}</Button>
      </div>
    </template>
    <template v-else>
      <h1 class="text-[26px] font-bold tracking-tight">{{ t(w('doneTitle')) }}</h1>
      <p class="text-[13.5px] text-muted-strong" role="status">{{ t(w('doneLead')) }}</p>
      <p class="text-[13px] text-muted-strong">{{ t(w('signedIn'), { name: session.me?.name ?? '' }) }}</p>
    </template>
  </main>
</template>
