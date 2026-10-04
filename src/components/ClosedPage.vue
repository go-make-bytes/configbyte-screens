<script setup lang="ts">
// The admin app closed to this person before anyone is signed in. Both reasons
// are the deployment's own settings, judged by the coordinator: the request came
// from outside the networks it allows — no sign-in is offered, since none would
// be answered — or the sign-in used was weaker than it asks for, and no session
// was made, so signing in again a stronger way is the one way on.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'uibyte'

import { isCardSoftwareMissing } from '../lib/webeid'
import { useAdminOptions } from '../options'
import type { Closed } from '../stores/session'
import { useAdminSession } from '../stores/session'
import AdminBrand from './AdminBrand.vue'

defineProps<{ reason: Exclude<Closed, ''> }>()

const { t, locale } = useI18n()
const options = useAdminOptions()
const session = useAdminSession()
const w = (key: string) => `configbyte.frame.closed.${key}`

const waitingForCard = ref(false)
const failed = ref('')

async function signInWithCard() {
  failed.value = ''
  waitingForCard.value = true
  try {
    await session.loginWithCard(locale.value)
  } catch (e) {
    failed.value = isCardSoftwareMissing(e) ? t('configbyte.frame.signIn.card.missing.lead') : t('configbyte.frame.signIn.card.failed')
  } finally {
    waitingForCard.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-8" :data-closed="reason">
    <AdminBrand :name="t(options.product)" tone="ink">
      <template #default="{ size }"><slot name="mark" :size="size" /></template>
    </AdminBrand>
    <h1 class="mt-6 text-3xl font-bold tracking-tight">{{ t(w(`${reason}.title`)) }}</h1>
    <p class="mt-3 text-muted-strong">{{ t(w(`${reason}.lead`), { product: t(options.product) }) }}</p>

    <div v-if="reason === 'assurance'" class="mt-6 flex flex-wrap items-start gap-3">
      <Button :disabled="waitingForCard" @click="signInWithCard">
        {{ waitingForCard ? t('configbyte.frame.signIn.card.waiting') : t('configbyte.frame.signIn.card.signIn') }}
      </Button>
      <Button variant="outline" :disabled="waitingForCard" @click="session.reopen()">{{ t(w('back')) }}</Button>
    </div>
    <p v-if="failed" role="alert" class="mt-4 font-mono text-[12px] text-status-late-fg">{{ failed }}</p>
  </main>
</template>
