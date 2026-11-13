<script setup lang="ts">
// One company of the deployment, on a page of its own: the products it has (a tick
// saves at once; taking one is asked first, in place), its administrators (the count
// comes with the company; the names only when somebody presses to see them, because
// showing them is recorded), and the file it starts from while nobody of it has signed
// in. No act here renames, closes or removes a company.
//
// A page reads the company and the products once when it opens, and the names of the
// starting files only while one can still be applied; an act reads again only the
// company, or the administrators it changed.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { ActLine, Button, Chip, ConfirmAsk, PageHeader, SelectField, StateBlock, type SelectOption } from 'uibyte'

import { ticksOf } from '../../lib/deployment'
import { DEPLOYMENT_COMPANIES } from '../../routes'
import { useDeployment, type Landed } from '../../stores/deployment'
import { useLast } from '../people/useLast'
import { useWhen } from '../people/useWhen'
import AreaRefusal from './AreaRefusal.vue'
import ConfigurationBand from './ConfigurationBand.vue'
import InviteAdministrator from './InviteAdministrator.vue'
import NoticeBand from './NoticeBand.vue'
import ProductTicks from './ProductTicks.vue'
import { useAfterOtherTab } from './useAfterOtherTab'

const { t } = useI18n()
const route = useRoute()
const deployment = useDeployment()
const when = useWhen()
const lastSignedIn = useLast()
const w = (key: string) => `configbyte.deployment.company.${key}`

const id = computed(() => String((Array.isArray(route.params.id) ? route.params.id[0] : route.params.id) ?? ''))
const company = computed(() => deployment.company)
const name = computed(() => company.value?.name ?? '')

/** The product whose taking is being asked about, and the administrator whose removal is. */
const asking = ref('')
const removing = ref('')
const inviting = ref(false)
const file = ref('')

/** What the opening that brought the person here left: said once, over the page, until something else is said. */
const arrival = ref<Landed | null>(null)

function open(keep = false) {
  asking.value = ''
  removing.value = ''
  inviting.value = false
  arrival.value = deployment.takeLanded(id.value) ?? (keep ? arrival.value : null)
  void deployment.openCompany(id.value)
}
watch(id, () => open(), { immediate: true })
// A file applied from this page says what became of it in place of what the opening said.
watch(
  () => deployment.configuration,
  (now) => {
    if (now) arrival.value = null
  },
)
// The names closing (after an invitation or a removal) closes the invitation form with them.
watch(
  () => deployment.administratorsState,
  (now) => {
    if (now !== 'shown') {
      inviting.value = false
      removing.value = ''
    }
  },
)
useAfterOtherTab()
// Nothing of the area outlives its pages.
onBeforeUnmount(() => deployment.reset())

// The first file is the one chosen until another is.
watch(
  () => deployment.configurations,
  (names) => {
    if (!names.includes(file.value)) file.value = names[0] ?? ''
  },
  { immediate: true },
)

const reading = computed(() => deployment.companyState === 'idle' || deployment.companyState === 'loading')
const ticks = computed(() => ticksOf(deployment.products, company.value?.products ?? []))
const askedProduct = computed(() => ticks.value.find((tk) => tk.key === asking.value))
const files = computed<SelectOption[]>(() => deployment.configurations.map((n) => ({ value: n, label: n })))
const adminsBusy = computed(() => deployment.busy === 'administrators')
const anyBusy = computed(() => deployment.busy !== '')
const onlyOne = computed(() => deployment.administrators.length <= 1)

/** A refusal that closes the page's place and leaves nothing of it; one that only puts a band over what is drawn. */
const wholeRefusal = computed(() => deployment.refusal === 'notAdmin' || deployment.refusal === 'noLonger' || (deployment.refusal === 'tooOld' && !company.value))
const bandRefusal = computed(() => deployment.refusal === 'tooOld' && !!company.value)

const said = computed(() => {
  const s = deployment.said
  if (!s) return null

  return { outcome: s.kind === 'refused' ? ('refused' as const) : ('done' as const), text: t(`configbyte.deployment.line.${s.key}`, s.values ?? {}) }
})

function tick(key: string, on: boolean) {
  if (on) {
    void deployment.setProduct(id.value, key, true)
  } else {
    asking.value = key
  }
}

function take() {
  const key = asking.value
  asking.value = ''
  void deployment.setProduct(id.value, key, false)
}

function remove(userId: string) {
  removing.value = ''
  void deployment.removeAdministrator(id.value, userId)
}

function apply() {
  if (file.value) void deployment.applyConfiguration(id.value, file.value)
}
</script>

<template>
  <section class="@container/page mx-auto max-w-6xl px-8 py-8">
    <PageHeader
      :eyebrow="t('configbyte.deployment.eyebrow')"
      :title="name || t(w('title'))"
      :subtitle="company ? t(w('opened'), { day: when.day(company.createdAt) }) : undefined"
      :back="{ label: t('configbyte.deployment.companies.title'), linkProps: { to: { name: DEPLOYMENT_COMPANIES } } }"
      :link-component="RouterLink"
    >
      <template v-if="company?.own" #title-after>
        <Chip tone="surface" data-mark="own">{{ t('configbyte.deployment.companies.own') }}</Chip>
      </template>
    </PageHeader>

    <AreaRefusal v-if="wholeRefusal && deployment.refusal" :refusal="deployment.refusal" />
    <p v-else-if="reading" role="status" class="mt-6 text-muted-strong" data-state="loading">{{ t(w('loading')) }}</p>
    <StateBlock
      v-else-if="deployment.companyState === 'missing'"
      class="mt-6"
      state="empty"
      size="page"
      :title="t(w('missing.title'))"
      :text="t(w('missing.text'))"
      data-state="missing"
    >
      <template #actions>
        <RouterLink :to="{ name: DEPLOYMENT_COMPANIES }" class="text-status-ontrack-fg hover:underline" data-link="companies">
          {{ t(w('missing.back')) }}
        </RouterLink>
      </template>
    </StateBlock>
    <StateBlock
      v-else-if="deployment.companyState === 'failed' || !company"
      class="mt-6"
      state="failed"
      size="page"
      :title="t(w('failed.title'))"
      :text="t(w(deployment.companyFailure === 'unanswered' ? 'failed.unanswered' : 'failed.plain'))"
      :retry-label="t(w('failed.retry'))"
      @retry="open(true)"
    />
    <template v-else>
      <div class="mt-4 grid gap-3">
        <AreaRefusal v-if="bandRefusal && deployment.refusal" :refusal="deployment.refusal" inline />
        <ConfigurationBand v-if="arrival?.configuration" opened :configuration="arrival.configuration" :company="company.name" />
        <NoticeBand v-else-if="arrival" tone="ok" data-band="opened">
          <template #title>{{ t(w('arrival.title'), { company: company.name }) }}</template>
          {{ t(w('arrival.lead')) }}
        </NoticeBand>
        <ConfigurationBand v-if="deployment.configuration" :configuration="deployment.configuration" :company="company.name" />
        <ActLine v-if="said" :outcome="said.outcome" :text="said.text" data-line="said" />
      </div>

      <!-- Products: a tick saves at once; taking one is asked first. -->
      <section class="mt-[18px] overflow-hidden rounded-card border border-line bg-surface" data-block="products">
        <h2 class="px-[18px] pb-1 pt-3.5 text-[15px] font-semibold">{{ t(w('products.title')) }}</h2>
        <StateBlock
          v-if="deployment.productsState === 'failed'"
          state="failed"
          :title="t(w('products.failed'))"
          :text="t(w(deployment.productsFailure === 'unanswered' ? 'failed.unanswered' : 'failed.plain'))"
          :retry-label="t(w('failed.retry'))"
          @retry="open(true)"
        />
        <p v-else-if="!ticks.length" class="px-[18px] pb-3.5 text-[13px] text-muted-strong" data-note="no-products">{{ t(w('products.none')) }}</p>
        <ProductTicks v-else :ticks="ticks" :disabled="anyBusy" :label="t(w('products.title'))" @change="tick" />
        <div v-if="askedProduct" class="px-[18px] pb-3.5">
          <ConfirmAsk
            :question="t(w('products.takeAsk'), { product: askedProduct.name, company: company.name })"
            :detail="t(w('products.takeLead'))"
            :confirm-label="t(w('products.takeDo'))"
            :keep-label="t(w('products.keep'))"
            danger
            @confirm="take"
            @keep="asking = ''"
          />
        </div>
      </section>

      <!-- Administrators: the count comes with the company; the names are a recorded read. -->
      <section class="mt-[18px] overflow-hidden rounded-card border border-line bg-surface" data-block="administrators">
        <h2 class="flex items-baseline gap-2 px-[18px] pb-1 pt-3.5 text-[15px] font-semibold">
          {{ t(w('administrators.title')) }}
          <em class="font-mono text-[11.5px] font-normal not-italic text-muted-strong" data-count="administrators">{{ company.administrators }}</em>
        </h2>

        <div v-if="deployment.administratorsState === 'hidden' || deployment.administratorsState === 'loading'" class="flex flex-wrap items-center gap-3 px-[18px] pb-3.5 pt-1.5">
          <Button size="sm" variant="outline" :disabled="adminsBusy" data-act="show-administrators" @click="deployment.showAdministrators(id)">
            {{ adminsBusy ? t(w('administrators.reading')) : t(w('administrators.show')) }}
          </Button>
          <span class="text-[12.5px] text-muted-strong" data-note="recorded">{{ t(w('administrators.recorded')) }}</span>
        </div>

        <div v-else-if="deployment.administratorsState === 'unrecorded'" class="px-[18px] pb-3.5">
          <div role="alert" class="rounded-card border border-line border-l-[3px] border-l-status-blocked bg-status-blocked-bg px-4 py-3 text-[13.5px]" data-band="unrecorded">
            <p class="font-semibold">{{ t(w('administrators.unrecorded.title')) }}</p>
            <p class="mt-1 text-muted-strong">{{ t(w('administrators.unrecorded.lead')) }}</p>
            <Button size="sm" variant="outline" class="mt-2.5" data-act="show-administrators" @click="deployment.showAdministrators(id)">
              {{ t(w('administrators.again')) }}
            </Button>
          </div>
        </div>

        <div v-else-if="deployment.administratorsState === 'failed'" class="px-[18px] pb-3.5">
          <p role="alert" class="text-[13.5px] text-status-late-fg" data-state="administrators-failed">{{ t(w('administrators.failed')) }}</p>
          <Button size="sm" variant="outline" class="mt-2" data-act="show-administrators" @click="deployment.showAdministrators(id)">
            {{ t(w('administrators.again')) }}
          </Button>
        </div>

        <template v-else>
          <p class="px-[18px] pb-1 text-[12.5px] text-muted-strong" data-note="recorded">{{ t(w('administrators.recorded')) }}</p>
          <ul class="m-0 list-none p-0" :aria-label="t(w('administrators.title'))" data-list="administrators">
            <li v-for="a in deployment.administrators" :key="a.userId" class="border-t border-line px-[18px] py-2.5" :data-administrator="a.userId">
              <div class="grid items-baseline gap-x-3 gap-y-1 @min-[560px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                <b class="font-semibold"><bdi>{{ a.displayName }}</bdi></b>
                <span class="text-[13px] text-muted-strong">
                  <template v-if="a.status === 'invited'">{{ t('configbyte.people.users.marks.invited') }}</template>
                  <template v-else>{{ t(w('administrators.last'), { when: lastSignedIn({ lastSignedInOn: a.lastSignedInOn }) }) }}</template>
                </span>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    :disabled="onlyOne || anyBusy"
                    :data-act="`remove-${a.userId}`"
                    @click="removing = a.userId"
                  >
                    {{ t(w('administrators.remove')) }}
                  </Button>
                </span>
              </div>
              <p v-if="onlyOne" class="mt-1 text-[12.5px] text-muted-strong" data-note="last-administrator">{{ t(w('administrators.last1')) }}</p>
              <div v-if="removing === a.userId" class="mt-2">
                <ConfirmAsk
                  :question="t(w('administrators.removeAsk'), { name: a.displayName, company: company.name })"
                  :detail="t(w('administrators.removeLead'), { name: a.displayName })"
                  :confirm-label="t(w('administrators.removeDo'))"
                  :keep-label="t(w('administrators.keep'))"
                  danger
                  @confirm="remove(a.userId)"
                  @keep="removing = ''"
                />
              </div>
            </li>
          </ul>
          <InviteAdministrator v-if="inviting" :company-id="id" @close="inviting = false" />
          <div v-else class="border-t border-line px-[18px] py-3">
            <Button size="sm" variant="outline" :disabled="anyBusy" data-act="invite-open" @click="inviting = true">{{ t(w('invite.open')) }}</Button>
          </div>
        </template>
      </section>

      <!-- The file it starts from: only until somebody of the company has signed in. -->
      <section class="mt-[18px] overflow-hidden rounded-card border border-line bg-surface" data-block="starting-configuration">
        <h2 class="px-[18px] pb-1 pt-3.5 text-[15px] font-semibold">{{ t(w('start.title')) }}</h2>
        <p v-if="company.entered" class="px-[18px] pb-3.5 text-[13px] text-muted-strong" data-note="entered">
          {{ t(w('start.entered'), { company: company.name }) }}
        </p>
        <template v-else>
          <p v-if="deployment.configurationsState === 'loading' || deployment.configurationsState === 'idle'" role="status" class="px-[18px] pb-3.5 text-[13px] text-muted-strong">
            {{ t(w('start.loading')) }}
          </p>
          <StateBlock
            v-else-if="deployment.configurationsState === 'failed'"
            state="failed"
            :title="t(w('start.failed'))"
            :text="t(w('failed.plain'))"
            :retry-label="t(w('failed.retry'))"
            @retry="deployment.readConfigurations()"
          />
          <p v-else-if="!files.length" class="px-[18px] pb-3.5 text-[13px] text-muted-strong" data-note="no-files">{{ t(w('start.none')) }}</p>
          <div v-else class="px-[18px] pb-3.5">
            <div class="flex flex-wrap items-center gap-3">
              <SelectField v-model="file" :options="files" :aria-label="t(w('start.file'))" size="sm" class="w-auto max-w-[260px]" :disabled="anyBusy" data-filter="file" />
              <Button size="sm" :disabled="!file || anyBusy" data-act="apply-file" @click="apply">
                {{ deployment.busy === 'apply' ? t(w('start.applying')) : t('configbyte.transfer.act.apply') }}
              </Button>
              <span class="text-[12.5px] text-muted-strong" data-note="only-until">{{ t(w('start.only'), { company: company.name }) }}</span>
            </div>
            <p v-if="deployment.configuration?.outcome === 'applied'" class="mt-2 text-[12.5px] text-muted-strong" data-note="again">
              {{ t(w('start.again'), { file: deployment.configuration.name }) }}
            </p>
          </div>
        </template>
      </section>
    </template>
  </section>
</template>
