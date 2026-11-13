<script setup lang="ts">
// The deployment admins: the people who manage the deployment. Opening this page is a
// recorded read of people, and the page says so. A person of the deployment's own
// company is added by personal code and country alone; removing one is asked first, in
// place. The last admin who has signed in keeps the button, switched off, with the reason.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ActLine, Button, ConfirmAsk, PageHeader, StateBlock } from 'uibyte'

import type { DeploymentAdmin } from '../../lib/deployment'
import { DEPLOYMENT_COMPANIES } from '../../routes'
import { useDeployment } from '../../stores/deployment'
import { useAdminSession } from '../../stores/session'
import { useLast } from '../people/useLast'
import { useWhen } from '../people/useWhen'
import AddDeploymentAdmin from './AddDeploymentAdmin.vue'
import AreaRefusal from './AreaRefusal.vue'
import NoticeBand from './NoticeBand.vue'
import { useAfterOtherTab } from './useAfterOtherTab'

const { t } = useI18n()
const deployment = useDeployment()
const session = useAdminSession()
const when = useWhen()
const lastSignedIn = useLast()
const w = (key: string) => `configbyte.deployment.admins.${key}`

const adding = ref(false)
const removing = ref('')

onMounted(() => void deployment.openDeploymentAdmins())
useAfterOtherTab()
// Nothing of the area outlives its pages.
onBeforeUnmount(() => deployment.reset())

const refusal = computed(() => (deployment.refusal === '' ? null : deployment.refusal))
const wholeRefusal = computed(() => refusal.value === 'notAdmin' || refusal.value === 'noLonger')
// The area refusing the person takes the form with it (it is a component of its own), and the way to it.
watch(wholeRefusal, (now) => {
  if (now) {
    adding.value = false
    removing.value = ''
  }
})
const state = computed(() => deployment.deploymentAdminsState)
const admins = computed(() => deployment.deploymentAdmins)
const anyBusy = computed(() => deployment.busy !== '')
const signedIn = computed(() => admins.value.filter((a) => a.status === 'active').length)

const minutes = computed(() => {
  const seconds = session.deployment?.signInAge

  return typeof seconds === 'number' && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0
})

/** The last admin who has signed in cannot be removed; one who was only invited can. */
const isLast = (a: DeploymentAdmin) => a.status === 'active' && signedIn.value <= 1
const asked = computed(() => admins.value.find((a) => a.userId === removing.value))

const said = computed(() => {
  const s = deployment.said

  return s ? { outcome: s.kind === 'refused' ? ('refused' as const) : ('done' as const), text: t(`configbyte.deployment.line.${s.key}`, s.values ?? {}) } : null
})

function open() {
  deployment.said = null
  deployment.nobodyByCode = false
  adding.value = true
}

function remove() {
  const a = asked.value
  removing.value = ''
  if (a) void deployment.removeDeploymentAdmin(a.userId)
}

const addedWords = (a: DeploymentAdmin) =>
  `${t(w(a.addedFrom === 'settings' ? 'addedSettings' : 'addedScreen'))}${a.addedAt ? ` · ${when.day(a.addedAt)}` : ''}`
</script>

<template>
  <section class="@container/page mx-auto max-w-6xl px-8 py-8">
    <PageHeader
      :eyebrow="t('configbyte.deployment.eyebrow')"
      :title="t(w('title'))"
      :subtitle="state === 'ready' ? t(w('count'), { n: admins.length }, admins.length) : undefined"
    >
      <template v-if="state === 'ready' && !adding" #actions>
        <Button size="sm" data-act="add-open" @click="open">{{ t(w('add')) }}</Button>
      </template>
    </PageHeader>

    <AreaRefusal v-if="wholeRefusal && deployment.refusal" :refusal="deployment.refusal" />
    <template v-else>
      <p class="mt-4 max-w-[92ch] text-[13.5px] text-muted-strong">{{ minutes ? t(w('lead'), { n: minutes }, minutes) : t(w('leadPlain')) }}</p>
      <p class="mt-1 text-[12.5px] text-muted-strong" data-note="recorded">{{ t(w('recorded')) }}</p>

      <div class="mt-3 grid max-w-[760px] gap-3">
        <AreaRefusal v-if="refusal === 'tooOld'" refusal="tooOld" inline />
        <ActLine v-if="said" :outcome="said.outcome" :text="said.text" data-line="said" />
      </div>

      <p v-if="state === 'idle' || state === 'loading'" role="status" class="mt-6 text-muted-strong" data-state="loading">{{ t(w('loading')) }}</p>
      <NoticeBand v-else-if="state === 'unrecorded'" class="mt-4 max-w-[760px]" tone="warn" data-band="unrecorded">
        <template #title>{{ t(w('unrecorded.title')) }}</template>
        {{ t(w('unrecorded.lead')) }}
        <template #actions>
          <Button size="sm" variant="outline" data-act="again" @click="deployment.openDeploymentAdmins()">{{ t(w('again')) }}</Button>
        </template>
      </NoticeBand>
      <StateBlock
        v-else-if="state === 'failed'"
        class="mt-4"
        state="failed"
        size="page"
        :title="t(w('failed.title'))"
        :text="t(w('failed.text'))"
        :retry-label="t(w('again'))"
        @retry="deployment.openDeploymentAdmins()"
      />
      <template v-else>
        <AddDeploymentAdmin v-if="adding" @close="adding = false" />

        <ul class="mt-4 list-none overflow-hidden rounded-card border border-line bg-surface p-0" :aria-label="t(w('title'))" data-list="deployment-admins">
          <li v-for="a in admins" :key="a.userId" class="border-t border-line px-[18px] py-2.5 first:border-t-0" :data-admin="a.userId">
            <div class="grid items-baseline gap-x-3 gap-y-1 @min-[760px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
              <span>
                <b class="font-semibold"><bdi>{{ a.displayName }}</bdi></b>
              </span>
              <span class="text-[13px] text-muted-strong">
                <template v-if="a.status === 'invited'">{{ t('configbyte.people.users.marks.invited') }}</template>
                <template v-else>{{ t('configbyte.deployment.company.administrators.last', { when: lastSignedIn({ lastSignedInOn: a.lastSignedInOn }) }) }}</template>
              </span>
              <span class="text-[13px] text-muted-strong">{{ addedWords(a) }}</span>
              <span>
                <Button size="sm" variant="outline" :disabled="isLast(a) || anyBusy" :data-act="`remove-${a.userId}`" @click="removing = a.userId">
                  {{ t(w('remove')) }}
                </Button>
              </span>
            </div>
            <p v-if="isLast(a)" class="mt-1 text-[12.5px] text-muted-strong" data-note="last-admin">{{ t(w('last')) }}</p>
            <div v-if="removing === a.userId" class="mt-2">
              <ConfirmAsk
                :question="t(w('removeAsk'), { name: a.displayName })"
                :detail="t(w('removeLead'), { name: a.displayName })"
                :confirm-label="t(w('removeDo'))"
                :keep-label="t(w('keep'))"
                danger
                @confirm="remove"
                @keep="removing = ''"
              />
            </div>
          </li>
        </ul>
        <p class="mt-3 text-[13px]">
          <RouterLink :to="{ name: DEPLOYMENT_COMPANIES }" class="text-status-ontrack-fg hover:underline" data-link="companies">{{ t('configbyte.deployment.company.missing.back') }}</RouterLink>
        </p>
      </template>
    </template>
  </section>
</template>
