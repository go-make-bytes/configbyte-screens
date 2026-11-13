<script setup lang="ts">
// Invite a person to administer a company: a name and a personal code with its
// country, checked the way the invitation form of People & access checks them. What
// is typed is held here, in the form, until the invitation is sent or the form is
// closed; the code goes out in that one request and is kept nowhere else.
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, IdentityCodeField, parseIdentityCode, TextField, type CountryGroup, type IdentityCodeError } from 'uibyte'

import { COUNTRIES, describeCode } from '../../lib/codes'
import { useDeployment } from '../../stores/deployment'

const props = defineProps<{ companyId: string }>()
const emit = defineEmits<{ close: [] }>()

const { t, te } = useI18n()
const deployment = useDeployment()
const w = (key: string) => `configbyte.people.users.invite.${key}`
const d = (key: string) => `configbyte.deployment.company.invite.${key}`

const name = ref('')
const code = ref('')
const country = ref(COUNTRIES[0]!)
const err = ref<'' | 'name' | 'code' | 'unusable'>('')

const sending = computed(() => deployment.busy === 'invite')

const countries = computed<CountryGroup[]>(() => [
  { key: 'baltic', countries: COUNTRIES.map((c) => ({ code: c, label: `${c} · ${t(`configbyte.people.users.way.country.${c}`)}` })) },
])

const describe = (error: IdentityCodeError, issuer: string): string => describeCode(t, te, error, issuer)

const unusable = computed(() => {
  const read = parseIdentityCode(code.value, country.value)

  return read.ok ? '' : describe(read, read.country ?? country.value)
})

const problem = computed(() => {
  switch (err.value) {
    case 'name':
      return t(w('errName'))
    case 'code':
      return t(w('errCode'))
    case 'unusable':
      return unusable.value
    default:
      return ''
  }
})

function forget() {
  name.value = ''
  code.value = ''
  country.value = COUNTRIES[0]!
  err.value = ''
}

// Nothing typed here outlives the form.
onBeforeUnmount(forget)

async function send() {
  const displayName = name.value.trim()
  const identityCode = code.value.trim()
  if (!displayName) {
    err.value = 'name'

    return
  }
  if (!identityCode) {
    err.value = 'code'

    return
  }
  if (!parseIdentityCode(identityCode, country.value).ok) {
    err.value = 'unusable'

    return
  }
  err.value = ''
  const ok = await deployment.invite(props.companyId, { displayName, identityCode, country: country.value })
  if (!ok) return
  forget()
  emit('close')
}

function cancel() {
  forget()
  emit('close')
}

const row = 'grid items-baseline gap-x-3.5 gap-y-1 @min-[560px]:grid-cols-[150px_minmax(0,1fr)]'
</script>

<template>
  <section class="border-t border-line px-[18px] py-4" data-block="invite" :aria-label="t(d('title'))">
    <h3 class="text-[15px] font-semibold">{{ t(d('title')) }}</h3>

    <div class="mt-3 grid gap-3">
      <div :class="row">
        <label for="company-invite-name" class="text-[13px] text-muted-strong">{{ t(w('name')) }}</label>
        <TextField id="company-invite-name" v-model="name" autocomplete="off" spellcheck="false" :disabled="sending" data-invite="name" @input="err = ''" />
      </div>
      <div :class="row">
        <label for="company-invite-code" class="text-[13px] text-muted-strong">{{ t(w('code')) }}</label>
        <div data-invite="code" @input="err = ''">
          <IdentityCodeField
            id="company-invite-code"
            v-model="code"
            v-model:country="country"
            :countries="countries"
            :label="t(w('code'))"
            :country-label="t(w('country'))"
            :describe="describe"
            :placeholder="t(w('placeholder'))"
            :note="t(d('note'))"
            :disabled="sending"
          />
        </div>
      </div>
    </div>

    <p v-if="problem" role="alert" class="mt-3 border-l-2 border-status-late py-0.5 pl-2.5 text-[12.5px] text-status-late-fg" data-note="invite-problem">
      {{ problem }}
    </p>

    <div class="mt-3.5 flex gap-2">
      <Button size="sm" :disabled="sending" data-act="invite" @click="send">{{ sending ? t(d('sending')) : t(w('submit')) }}</Button>
      <Button size="sm" variant="outline" :disabled="sending" data-act="cancel-invite" @click="cancel">{{ t(w('cancel')) }}</Button>
    </div>
  </section>
</template>
