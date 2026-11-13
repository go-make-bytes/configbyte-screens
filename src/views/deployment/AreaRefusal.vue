<script setup lang="ts">
// The area refused the person as a whole, and this says why. Either the sign-in is older
// than the area accepts (the rest of the admin app stays open), or the person manages
// nothing here. In its own place it stands alone, with nothing of the area drawn beside
// it; `inline` puts it over a page that is already drawn, as a band, leaving the page
// as it was. A sign-in too old inline offers to sign in again in a new tab, so what is
// typed on the page is never lost.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Button } from 'uibyte'

import { DEPLOYMENT_SIGN_IN_TAB } from '../../routes'
import { useDeployment } from '../../stores/deployment'
import { useAdminSession } from '../../stores/session'
import NoticeBand from './NoticeBand.vue'
import SignInAgainPage from './SignInAgainPage.vue'

const props = defineProps<{ refusal: 'tooOld' | 'notAdmin' | 'noLonger'; inline?: boolean }>()

const { t } = useI18n()
const router = useRouter()
const session = useAdminSession()
const deployment = useDeployment()
const w = (key: string) => `configbyte.deployment.refusal.${key}`

/** The age the deployment asks of a sign-in, in whole minutes, when it names one. */
const minutes = computed(() => {
  const seconds = session.deployment?.signInAge

  return typeof seconds === 'number' && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0
})

const lead = computed(() => {
  if (props.refusal !== 'tooOld') return t(w(`${props.refusal}.lead`))

  return minutes.value ? t(w('tooOld.lead'), { n: minutes.value }, minutes.value) : t(w('tooOld.leadPlain'))
})

function inNewTab() {
  deployment.openSignInTab(router.resolve({ name: DEPLOYMENT_SIGN_IN_TAB }).href)
}
</script>

<template>
  <NoticeBand v-if="inline" tone="warn" :data-refusal="refusal">
    <template #title>{{ t(w(`${refusal}.title`)) }}</template>
    {{ lead }}
    <template v-if="refusal === 'tooOld'" #actions>
      <Button size="sm" variant="outline" data-act="sign-in-new-tab" @click="inNewTab">{{ t(w('tooOld.newTab')) }}</Button>
    </template>
  </NoticeBand>
  <SignInAgainPage v-else-if="refusal === 'tooOld'" :data-refusal="refusal" />
  <section v-else class="mx-auto mt-10 max-w-[640px] px-5 py-6 text-center" :data-refusal="refusal" role="alert">
    <h2 class="text-[22px] font-semibold tracking-tight">{{ t(w(`${refusal}.title`)) }}</h2>
    <p class="mt-2 text-[13.5px] text-muted-strong">{{ lead }}</p>
  </section>
</template>
