<script setup lang="ts">
// The form that opens a company: its name, the language its starting roles are named in,
// the products it has, the file it starts from, and its first administrator by name and
// personal code, written together or not at all.
//
// The browser checks what the register checks for the name (1 to 200 characters after
// trimming) and for the person (as the invitation form checks), so a refusal of those is
// rare. Which products can be ticked is worked out here from what each needs. What is
// typed is held in this component and in the one request that sends it, and nowhere else:
// not in a store, not in storage, not in an address. It goes when the form is left or sent,
// and the page takes this component away whenever the area refuses the person as a whole.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ActLine,
  Button,
  IdentityCodeField,
  parseIdentityCode,
  SegmentedChoice,
  SelectField,
  TextField,
  type CountryGroup,
  type IdentityCodeError,
  type SegmentedOption,
  type SelectOption,
} from 'uibyte'

import { COUNTRIES, describeCode } from '../../lib/codes'
import { ticksOf } from '../../lib/deployment'
import { DEPLOYMENT_COMPANIES, DEPLOYMENT_COMPANY } from '../../routes'
import { useDeployment } from '../../stores/deployment'
import { useAdminSession } from '../../stores/session'
import AreaRefusal from './AreaRefusal.vue'
import NoticeBand from './NoticeBand.vue'
import ProductTicks from './ProductTicks.vue'

/** The most characters a company's name may have, as the register counts them. */
const NAME_MAX = 200

const { t, te, locale, availableLocales } = useI18n()
const router = useRouter()
const deployment = useDeployment()
const session = useAdminSession()
const w = (key: string) => `configbyte.deployment.open.${key}`
const p = (key: string) => `configbyte.people.users.invite.${key}`

const name = ref('')
const language = ref(availableLocales.includes(session.me?.presentation.locale ?? '') ? (session.me?.presentation.locale ?? 'en') : locale.value)
const ticked = ref<string[]>([])
const startsFrom = ref('')
const personName = ref('')
const code = ref('')
const country = ref(COUNTRIES[0]!)
const err = ref<'' | 'name' | 'nameLong' | 'person' | 'code' | 'unusable'>('')

function forget() {
  name.value = ''
  ticked.value = []
  startsFrom.value = ''
  personName.value = ''
  code.value = ''
  country.value = COUNTRIES[0]!
  err.value = ''
}
// Nothing typed here outlives the form.
onBeforeUnmount(forget)

// The name has the focus when the form is drawn.
onMounted(async () => {
  await nextTick()
  document.getElementById('open-name')?.focus()
})

const refusal = computed(() => (deployment.refusal === '' ? null : deployment.refusal))
const sending = computed(() => deployment.busy === 'open')

const trimmed = computed(() => name.value.trim())
const ticks = computed(() => ticksOf(deployment.products, ticked.value))
const languages = computed<SegmentedOption[]>(() => availableLocales.map((c) => ({ key: c, label: t('configbyte.signIn.self', {}, { locale: c }) })))
const files = computed<SelectOption[]>(() => [{ value: '', label: t(w('empty')) }, ...deployment.configurations.map((n) => ({ value: n, label: n }))])
const countries = computed<CountryGroup[]>(() => [
  { key: 'baltic', countries: COUNTRIES.map((c) => ({ code: c, label: `${c} · ${t(`configbyte.people.users.way.country.${c}`)}` })) },
])

const describe = (error: IdentityCodeError, issuer: string): string => describeCode(t, te, error, issuer)
const unusable = computed(() => {
  const read = parseIdentityCode(code.value, country.value)

  return read.ok ? '' : describe(read, read.country ?? country.value)
})

/** Whether a name, a person and a code are given: what the button waits for. */
const ready = computed(() => !!trimmed.value && !!personName.value.trim() && !!code.value.trim())

/** The line under *Name*: a name the register says is taken, or what the browser found wrong with it. */
const nameError = computed(() => {
  if (deployment.nameTaken) return t(w('nameTaken'))
  if (err.value === 'name') return t(w('errName'))
  if (err.value === 'nameLong') return t(w('errNameLong'), { n: NAME_MAX })

  return ''
})
const personProblem = computed(() => {
  switch (err.value) {
    case 'person':
      return t(p('errName'))
    case 'code':
      return t(p('errCode'))
    case 'unusable':
      return unusable.value
    default:
      return ''
  }
})

/** The refusals that say nothing was opened and why, in a band; the rest are one line. */
const band = computed(() => {
  const said = deployment.said

  return said && ['openFileUnknown', 'openFileBad', 'openStarting'].includes(said.key) ? said : null
})
const line = computed(() => {
  const said = deployment.said
  if (!said || band.value) return null
  const extra = said.key === 'openRefusedPerson' ? ` ${t('configbyte.people.refused.inviteInvalid')}` : ''

  return { outcome: said.kind === 'refused' ? ('refused' as const) : ('done' as const), text: `${t(`configbyte.deployment.line.${said.key}`, said.values ?? {})}${extra}` }
})

function change(key: string, on: boolean) {
  ticked.value = on ? [...ticked.value, key] : ticked.value.filter((k) => k !== key)
}

async function send() {
  if (sending.value) return
  const length = Array.from(trimmed.value).length
  if (!length) {
    err.value = 'name'

    return
  }
  if (length > NAME_MAX) {
    err.value = 'nameLong'

    return
  }
  if (!personName.value.trim()) {
    err.value = 'person'

    return
  }
  if (!code.value.trim()) {
    err.value = 'code'

    return
  }
  if (!parseIdentityCode(code.value.trim(), country.value).ok) {
    err.value = 'unusable'

    return
  }
  err.value = ''
  const id = await deployment.openNew({
    name: trimmed.value,
    language: language.value,
    products: [...ticked.value].sort(),
    startsFrom: startsFrom.value,
    administrator: { displayName: personName.value.trim(), identityCode: code.value.trim(), country: country.value },
  })
  // Opened: what was typed goes with the form, and the company's own page says what became of it.
  if (!deployment.said && !deployment.nameTaken && deployment.refusal === '' && (id || deployment.landed)) {
    forget()
    void router.push(id ? { name: DEPLOYMENT_COMPANY, params: { id } } : { name: DEPLOYMENT_COMPANIES })
  }
}

function cancel() {
  forget()
  void router.push({ name: DEPLOYMENT_COMPANIES })
}

const row = 'grid items-baseline gap-x-3.5 gap-y-1 @min-[560px]:grid-cols-[170px_minmax(0,1fr)]'
</script>

<template>
  <div>
    <div class="mt-4 grid max-w-[760px] gap-3">
      <AreaRefusal v-if="refusal === 'tooOld'" refusal="tooOld" inline />
      <NoticeBand v-if="band" tone="no" data-band="not-opened">
        <template #title>{{ t(w('notOpened')) }}</template>
        {{ t(`configbyte.deployment.line.${band.key}`, band.values ?? {}) }}
      </NoticeBand>
      <ActLine v-if="line" :outcome="line.outcome" :text="line.text" data-line="said" />
    </div>

    <form class="mt-4 max-w-[760px] rounded-card border border-line bg-surface px-[18px] py-4" data-form="open-company" novalidate @submit.prevent="send">
      <div class="grid gap-4">
        <div :class="row">
          <label for="open-name" class="text-[13px] text-muted-strong">{{ t(w('name')) }}</label>
          <TextField id="open-name" v-model="name" autocomplete="off" spellcheck="false" :disabled="sending" :error="nameError" :placeholder="t(w('namePlaceholder'))" @input="err = ''" />
        </div>
        <div :class="row">
          <span class="text-[13px] text-muted-strong">
            {{ t(w('language')) }}
            <small class="block text-[12px] text-muted">{{ t(w('languageHint')) }}</small>
          </span>
          <SegmentedChoice v-model="language" :options="languages" :label="t(w('language'))" />
        </div>
        <div :class="row">
          <span class="text-[13px] text-muted-strong">
            {{ t(w('products')) }}
            <small class="block text-[12px] text-muted">{{ t(w('productsHint')) }}</small>
          </span>
          <div class="-mx-[18px] @min-[560px]:mx-0">
            <ProductTicks v-if="ticks.length" :ticks="ticks" :disabled="sending" :label="t(w('products'))" @change="change" />
            <p v-else class="text-[13px] text-muted-strong" data-note="no-products">{{ t(w('noProducts')) }}</p>
          </div>
        </div>
        <div :class="row">
          <label for="open-starts-from" class="text-[13px] text-muted-strong">
            {{ t(w('startsFrom')) }}
            <small class="block text-[12px] text-muted">{{ t(w('startsFromHint')) }}</small>
          </label>
          <div>
            <SelectField id="open-starts-from" v-model="startsFrom" :options="files" :aria-label="t(w('startsFrom'))" :disabled="sending" class="max-w-[320px]" />
            <p class="mt-1 text-[12.5px] text-muted-strong" data-note="files">
              {{ deployment.configurations.length ? t(w('filesHint')) : t(w('noFilesHint')) }}
            </p>
          </div>
        </div>
        <div :class="row">
          <label for="open-person" class="text-[13px] text-muted-strong">
            {{ t(w('administrator')) }}
            <small class="block text-[12px] text-muted">{{ t(w('administratorHint')) }}</small>
          </label>
          <div class="grid gap-2">
            <TextField id="open-person" v-model="personName" autocomplete="off" spellcheck="false" :disabled="sending" :placeholder="t(p('name'))" @input="err = ''" />
            <div data-open="code" @input="err = ''">
              <IdentityCodeField
                id="open-code"
                v-model="code"
                v-model:country="country"
                :countries="countries"
                :label="t(p('code'))"
                :country-label="t(p('country'))"
                :describe="describe"
                :placeholder="t(p('placeholder'))"
                :note="t(w('administratorNote'))"
                :disabled="sending"
              />
            </div>
            <p v-if="personProblem" role="alert" class="border-l-2 border-status-late py-0.5 pl-2.5 text-[12.5px] text-status-late-fg" data-note="person-problem">
              {{ personProblem }}
            </p>
          </div>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <Button type="submit" :disabled="!ready || sending" data-act="open">
          {{ sending ? t(w('opening')) : ready ? t(w('submit'), { name: trimmed }) : t(w('submitEmpty')) }}
        </Button>
        <Button type="button" variant="outline" :disabled="sending" data-act="cancel" @click="cancel">{{ t(w('cancel')) }}</Button>
        <span v-if="!ready" class="text-[12.5px] text-muted-strong" data-note="waits">{{ t(w('waits')) }}</span>
      </div>
    </form>
  </div>
</template>
