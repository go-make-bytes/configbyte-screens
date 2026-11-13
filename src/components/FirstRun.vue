<script setup lang="ts">
// The first run: shown in place of everything, before the menu, to the person the
// deployment names to set it up, in both kinds of deployment. One question: the
// company's name and the language its starting roles are named in. The sign-in answer
// is read again when it is done, and the app opens.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ActLine, Button, SegmentedChoice, TextField, type SegmentedOption } from 'uibyte'

import AdminBrand from './AdminBrand.vue'
import { useAdminOptions } from '../options'
import { useAdminSession } from '../stores/session'
import { useDeployment } from '../stores/deployment'
import AreaRefusal from '../views/deployment/AreaRefusal.vue'
import NoticeBand from '../views/deployment/NoticeBand.vue'
import { useAfterOtherTab } from '../views/deployment/useAfterOtherTab'

/** The most characters a company's name may have, as the register counts them. */
const NAME_MAX = 200

const { t, locale, availableLocales } = useI18n()
const session = useAdminSession()
const deployment = useDeployment()
const options = useAdminOptions()
const w = (key: string) => `configbyte.deployment.firstRun.${key}`

const local = computed(() => session.deployment?.mode === 'local')
const name = ref('')
const language = ref(availableLocales.includes(session.me?.presentation.locale ?? '') ? (session.me?.presentation.locale ?? 'en') : locale.value)
const err = ref<'' | 'name' | 'nameLong'>('')
const sending = computed(() => deployment.busy === 'first-run')

useAfterOtherTab()
onMounted(() => {
  // The person this page was opened for: every act checks the server still says so.
  deployment.pin()
  document.getElementById('first-run-name')?.focus()
})

const languages = computed<SegmentedOption[]>(() => availableLocales.map((c) => ({ key: c, label: t('configbyte.signIn.self', {}, { locale: c }) })))
const brand = computed(() => session.me?.presentation.displayName || t(options.product))
const starting = computed(() => deployment.said?.key === 'firstRunStarting')
const line = computed(() => {
  const said = deployment.said
  if (!said || starting.value) return null

  return { outcome: said.kind === 'refused' ? ('refused' as const) : ('done' as const), text: t(`configbyte.deployment.line.${said.key}`, said.values ?? {}) }
})
const nameError = computed(() => (err.value === 'name' ? t(w('errName')) : err.value === 'nameLong' ? t(w('errNameLong'), { n: NAME_MAX }) : ''))
const tooOld = computed(() => deployment.refusal === 'tooOld')

async function send() {
  if (sending.value) return
  const trimmed = name.value.trim()
  const length = Array.from(trimmed).length
  if (!length) {
    err.value = 'name'

    return
  }
  if (length > NAME_MAX) {
    err.value = 'nameLong'

    return
  }
  err.value = ''
  const done = await deployment.runFirst(trimmed, language.value)
  // What was typed is not kept once it has gone.
  if (done) name.value = ''
}
</script>

<template>
  <main class="@container/page mx-auto flex min-h-screen max-w-[520px] flex-col justify-center gap-4 px-6 py-10" data-page="first-run" :data-mode="local ? 'local' : 'saas'">
    <AdminBrand :name="brand" tone="ink">
      <template #default="{ size }"><slot name="mark" :size="size" /></template>
    </AdminBrand>
    <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{{ t(w(local ? 'eyebrowLocal' : 'eyebrow')) }}</p>
    <h1 class="text-[26px] font-bold tracking-tight">{{ t(w(local ? 'titleLocal' : 'title')) }}</h1>
    <p class="text-[13.5px] text-muted-strong" data-note="lead">{{ t(w(local ? 'leadLocal' : 'lead')) }}</p>

    <AreaRefusal v-if="tooOld" refusal="tooOld" inline />
    <NoticeBand v-if="starting" tone="warn" data-band="starting">
      <template #title>{{ t(w('startingTitle')) }}</template>
      {{ t(w('startingLead')) }}
    </NoticeBand>
    <ActLine v-if="line" :outcome="line.outcome" :text="line.text" data-line="said" />

    <form class="grid gap-4" novalidate @submit.prevent="send">
      <div class="grid gap-1">
        <label for="first-run-name" class="text-[13px] text-muted-strong">{{ t(w('name')) }}</label>
        <TextField id="first-run-name" v-model="name" autocomplete="off" spellcheck="false" :disabled="sending" :error="nameError" :placeholder="t(w('namePlaceholder'))" @input="err = ''" />
      </div>
      <div class="grid gap-1">
        <span class="text-[13px] text-muted-strong">{{ t(w('language')) }}</span>
        <SegmentedChoice v-model="language" :options="languages" :label="t(w('language'))" />
        <span class="text-[12.5px] text-muted-strong">{{ t(w('languageHint')) }}</span>
      </div>
      <div>
        <Button type="submit" :disabled="sending" data-act="first-run">
          {{ sending ? t(w('doing')) : starting ? t(w('again')) : t(w('submit')) }}
        </Button>
      </div>
    </form>

    <div class="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[13px] text-muted-strong">
      <span>{{ t(w('signedIn'), { name: session.me?.name ?? '' }) }}</span>
      <Button variant="ghost" size="sm" data-act="sign-out" @click="session.logout()">{{ t('configbyte.frame.logout') }}</Button>
    </div>
  </main>
</template>
