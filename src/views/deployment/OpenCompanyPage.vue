<script setup lang="ts">
// Open a company: the page around the form. It reads what a company can have (the products
// and the files a company may start from), says when that cannot be read, and shows the
// area's refusal of the person in the form's place. The form is a component of its own, so
// that when the area refuses the person as a whole it is taken away, and what was typed in
// it is not left in memory.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { PageHeader, StateBlock } from 'uibyte'

import { DEPLOYMENT_COMPANIES } from '../../routes'
import { useDeployment } from '../../stores/deployment'
import AreaRefusal from './AreaRefusal.vue'
import OpenCompanyForm from './OpenCompanyForm.vue'
import { useAfterOtherTab } from './useAfterOtherTab'

const { t } = useI18n()
const deployment = useDeployment()
const w = (key: string) => `configbyte.deployment.open.${key}`

onMounted(() => void deployment.openForm())
useAfterOtherTab()
// Nothing of the area outlives its pages.
onBeforeUnmount(() => deployment.reset())

const wholeRefusal = computed(() => deployment.refusal === 'notAdmin' || deployment.refusal === 'noLonger')
const reading = computed(() => deployment.productsState === 'idle' || deployment.productsState === 'loading' || deployment.configurationsState === 'loading')
const failed = computed(() => deployment.productsState === 'failed' || deployment.configurationsState === 'failed')
</script>

<template>
  <section class="@container/page mx-auto max-w-6xl px-8 py-8">
    <PageHeader
      :eyebrow="t('configbyte.deployment.eyebrow')"
      :title="t(w('title'))"
      :subtitle="t(w('lead'))"
      :back="{ label: t('configbyte.deployment.companies.title'), linkProps: { to: { name: DEPLOYMENT_COMPANIES } } }"
      :link-component="RouterLink"
    />

    <AreaRefusal v-if="wholeRefusal && deployment.refusal" :refusal="deployment.refusal" />
    <p v-else-if="reading" role="status" class="mt-6 text-muted-strong" data-state="loading">{{ t(w('loading')) }}</p>
    <StateBlock
      v-else-if="failed"
      class="mt-6"
      state="failed"
      size="page"
      :title="t(w('failed.title'))"
      :text="t(w('failed.text'))"
      :retry-label="t(w('failed.retry'))"
      @retry="deployment.openForm()"
    />
    <OpenCompanyForm v-else />
  </section>
</template>
