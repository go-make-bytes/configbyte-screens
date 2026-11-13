<script setup lang="ts">
// The page that says a sign-in is too old for the deployment's own area, and starts one
// that is recent, in this tab. The address being opened is kept in this tab's session
// storage (an address, never data) and opened when the sign-in comes back. The rest of
// the admin app stays open to the person as it is.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Button } from 'uibyte'

import { keepReturn } from '../../lib/again'
import type { SignInWay } from '../../lib/signin'
import { useAdminSession } from '../../stores/session'
import { useWhen } from '../people/useWhen'

const { t } = useI18n()
const route = useRoute()
const session = useAdminSession()
const when = useWhen()
const w = (key: string) => `configbyte.deployment.again.${key}`

// Signed in, the ways may not have been read; the page needs their names.
onMounted(() => void session.readWays())

const minutes = computed(() => {
  const seconds = session.deployment?.signInAge

  return typeof seconds === 'number' && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0
})

/** The way the person used, when the deployment still offers it. */
const used = computed(() => session.ways.find((way) => way.key === session.me?.loginMethod))

const lead = computed(() => {
  const at = session.me?.signedInAt
  const asked = minutes.value ? t(w('askedFor'), { n: minutes.value }, minutes.value) : t(w('askedForPlain'))

  return `${asked} ${at ? t(w('signedAt'), { when: when.moment(at) }) : t(w('signedUnknown'))} ${t(w('restOpen'))}`
})

function again(way: SignInWay) {
  keepReturn(route.fullPath)
  void session.start(way, true)
}
</script>

<template>
  <section class="@container/page mx-auto max-w-6xl px-8 py-8" data-page="sign-in-again">
    <div class="mx-auto max-w-[640px] px-5 pb-10 pt-16 text-center">
      <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{{ t('configbyte.deployment.eyebrow') }}</p>
      <h1 class="mt-1 text-[24px] font-bold tracking-tight">{{ t(w('title')) }}</h1>
      <p class="mt-2 text-[13.5px] text-muted-strong" data-note="lead">{{ lead }}</p>
      <div class="mt-5 flex flex-wrap justify-center gap-2.5">
        <Button v-if="used" data-act="sign-in-again" @click="again(used)">{{ t(w('button')) }}</Button>
        <template v-else>
          <p class="w-full text-[13px] text-muted-strong" data-note="ways">{{ t(w('chooseWay')) }}</p>
          <Button v-for="way in session.ways" :key="way.key" :data-way="way.key" @click="again(way)">{{ way.name }}</Button>
        </template>
      </div>
      <p v-if="session.message === 'failed'" role="alert" class="mt-3 text-[13px] text-status-late-fg" data-note="not-started">
        {{ t('configbyte.signIn.message.failed') }}
      </p>
    </div>
  </section>
</template>
