<script setup lang="ts">
// Companies: every company this deployment serves, with what each has. A row is one
// link to the company's own page, where every act on it is: a row that is a link
// cannot also carry a button. The companies and the products are read once each, together,
// when the page opens; finding a company and its pages work in the browser.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { Button, Chip, foldForFind, ListTable, PageHeader, Pager, StateBlock, TextField, type ListColumn } from 'uibyte'

import { namesOf, narrow, type Company } from '../../lib/deployment'
import { PAGE_SIZE } from '../../lib/people'
import { DEPLOYMENT_COMPANY, DEPLOYMENT_COMPANY_NEW } from '../../routes'
import { useDeployment } from '../../stores/deployment'
import { useWhen } from '../people/useWhen'
import AreaRefusal from './AreaRefusal.vue'
import { useAfterOtherTab } from './useAfterOtherTab'

const { t } = useI18n()
const router = useRouter()
const deployment = useDeployment()
const when = useWhen()
const w = (key: string) => `configbyte.deployment.companies.${key}`

const query = ref('')
const page = ref(1)

onMounted(() => void deployment.openList())
useAfterOtherTab()
// Nothing of the area outlives its pages.
onBeforeUnmount(() => deployment.reset())

const refusal = computed(() => (deployment.refusal === '' ? null : deployment.refusal))
const reading = computed(() => deployment.companiesState === 'idle' || deployment.companiesState === 'loading' || deployment.productsState === 'loading')
const failed = computed(() => deployment.companiesState === 'failed' || deployment.productsState === 'failed')

/** What a failed read says: which list could not be read, and whether the service answered at all. */
const failure = computed(() => {
  const which = deployment.companiesState === 'failed' ? 'companies' : 'products'
  const unanswered = (which === 'companies' ? deployment.companiesFailure : deployment.productsFailure) === 'unanswered'

  return { title: t(w(`failed.${which}`)), text: t(w(unanswered ? 'failed.unanswered' : 'failed.plain')) }
})

const customers = computed(() => deployment.companies.filter((c) => !c.own).length)
const rows = computed(() => narrow(deployment.companies, query.value, foldForFind))
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)))
const pageNo = computed(() => Math.min(page.value, pages.value))
const shown = computed(() => rows.value.slice((pageNo.value - 1) * PAGE_SIZE, pageNo.value * PAGE_SIZE))
const range = computed(() =>
  t(w('pager.range'), { from: (pageNo.value - 1) * PAGE_SIZE + 1, to: Math.min(rows.value.length, pageNo.value * PAGE_SIZE), total: rows.value.length }),
)

// A change to what is shown goes back to the first page.
watch(query, () => {
  page.value = 1
})

const columns = computed<ListColumn[]>(() => [
  { key: 'name', label: t(w('columns.name')), priority: 1, width: 'minmax(220px,2fr)' },
  { key: 'products', label: t(w('columns.products')), priority: 2, width: 'minmax(200px,3fr)' },
  { key: 'administrators', label: t(w('columns.administrators')), priority: 3, width: '150px' },
  { key: 'opened', label: t(w('columns.opened')), width: '110px', end: true },
])

const link = (c: Company) => ({ to: { name: DEPLOYMENT_COMPANY, params: { id: c.id } } })
const productsOf = (c: Company) => namesOf(c.products, deployment.products)
</script>

<template>
  <section class="@container/page mx-auto max-w-6xl px-8 py-8">
    <PageHeader
      :eyebrow="t('configbyte.deployment.eyebrow')"
      :title="t(w('title'))"
      :subtitle="deployment.companiesState === 'ready' ? t(w('count'), { n: deployment.companies.length }, deployment.companies.length) : undefined"
    >
      <template v-if="!refusal && deployment.listReady" #actions>
        <Button size="sm" data-act="open-company" @click="router.push({ name: DEPLOYMENT_COMPANY_NEW })">{{ t(w('open')) }}</Button>
      </template>
    </PageHeader>

    <AreaRefusal v-if="refusal" :refusal="refusal" />
    <p v-else-if="reading" role="status" class="mt-6 text-muted-strong" data-state="loading">{{ t(w('loading')) }}</p>
    <StateBlock
      v-else-if="failed"
      class="mt-6"
      state="failed"
      size="page"
      :title="failure.title"
      :text="failure.text"
      :retry-label="t(w('failed.retry'))"
      @retry="deployment.openList()"
    />
    <template v-else>
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p class="max-w-[92ch] text-[13.5px] text-muted-strong">{{ t(w('lead')) }}</p>
        <TextField
          v-if="deployment.companies.length > 1"
          v-model="query"
          type="search"
          size="sm"
          :aria-label="t(w('find'))"
          :placeholder="t(w('find'))"
          data-filter="find"
          class="w-60 max-w-full"
        />
      </div>

      <ListTable
        class="mt-3.5"
        :columns="columns"
        :rows="shown"
        :row-key="(c) => c.id"
        :label="t(w('title'))"
        :row-link="link"
        :link-component="RouterLink"
      >
        <template #cell-name="{ row }">
          <span class="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <b class="font-semibold"><bdi>{{ row.name }}</bdi></b>
            <Chip v-if="row.own" tone="surface" data-mark="own">{{ t(w('own')) }}</Chip>
          </span>
        </template>
        <!-- A cell always draws an element: a slot that draws nothing falls back to the raw value. -->
        <template #cell-products="{ row }">
          <span class="inline-flex flex-wrap items-center gap-1">
            <Chip v-for="name in productsOf(row)" :key="name"><bdi>{{ name }}</bdi></Chip>
            <span v-if="!row.products.length" class="text-faint" data-note="no-product">{{ t(w('noProduct')) }}</span>
            <span v-else-if="!productsOf(row).length" class="text-faint">—</span>
          </span>
        </template>
        <template #cell-administrators="{ row }">
          <span class="text-muted-strong">{{ t(w('administrators'), { n: row.administrators }, row.administrators) }}</span>
        </template>
        <template #cell-opened="{ row }">
          <span class="text-muted-strong">{{ when.day(row.createdAt) }}</span>
        </template>
        <template #footer>
          <p v-if="!rows.length" class="border-t border-line px-[18px] py-[22px] text-[13.5px] text-muted-strong" data-note="no-match">
            {{ t(w('noMatch')) }}
            <button
              type="button"
              class="rounded-chip text-status-ontrack-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              @click="query = ''"
            >
              {{ t(w('showEvery')) }}
            </button>
          </p>
          <Pager
            v-if="pages > 1"
            :page="pageNo"
            :pages="pages"
            :range="range"
            :label="t(w('pager.label'))"
            :previous-label="t(w('pager.previous'))"
            :next-label="t(w('pager.next'))"
            :page-label="(n) => t(w('pager.page'), { n })"
            @update:page="(n) => (page = n)"
          />
        </template>
      </ListTable>

      <section
        v-if="!customers"
        class="mt-4 max-w-[760px] rounded-card border border-dashed border-line bg-surface px-[18px] py-3.5"
        data-block="no-customer"
      >
        <h3 class="text-[14px] font-semibold">{{ t(w('noCustomer.title')) }}</h3>
        <p class="mt-1 text-[13px] text-muted-strong">
          {{ t(w('noCustomer.lead')) }}
          <RouterLink
            :to="{ name: DEPLOYMENT_COMPANY_NEW }"
            class="rounded-chip text-status-ontrack-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            data-link="open-company"
          >
            {{ t(w('noCustomer.open')) }}
          </RouterLink>
        </p>
      </section>
    </template>
  </section>
</template>
