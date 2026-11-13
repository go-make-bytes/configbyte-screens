<script setup lang="ts">
// The form that adds a deployment admin: a personal code and its country, nothing else. The
// code is held in this component and in the one request that sends it, and nowhere else:
// not in the page around it, not in a store, not in storage. The page takes this component
// away whenever the area refuses the person as a whole, so a code typed here cannot come
// back after a retry, nor be sent by a person who has since been pinned.
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, IdentityCodeField, parseIdentityCode, type CountryGroup, type IdentityCodeError } from 'uibyte'

import { COUNTRIES, describeCode } from '../../lib/codes'
import { useDeployment } from '../../stores/deployment'

const emit = defineEmits<{ close: [] }>()

const { t, te } = useI18n()
const deployment = useDeployment()
const w = (key: string) => `configbyte.deployment.admins.${key}`

const code = ref('')
const country = ref(COUNTRIES[0]!)
const err = ref<'' | 'code' | 'unusable'>('')

const sending = computed(() => deployment.busy === 'add-admin')

function forget() {
  code.value = ''
  country.value = COUNTRIES[0]!
  err.value = ''
}
// Nothing typed here outlives the form.
onBeforeUnmount(forget)

const countries = computed<CountryGroup[]>(() => [
  { key: 'baltic', countries: COUNTRIES.map((c) => ({ code: c, label: `${c} · ${t(`configbyte.people.users.way.country.${c}`)}` })) },
])
const describe = (error: IdentityCodeError, issuer: string): string => describeCode(t, te, error, issuer)
const unusable = computed(() => {
  const read = parseIdentityCode(code.value, country.value)

  return read.ok ? '' : describe(read, read.country ?? country.value)
})
const problem = computed(() => {
  if (deployment.nobodyByCode) return t(w('nobody'))
  if (err.value === 'code') return t('configbyte.people.users.invite.errCode')

  return err.value === 'unusable' ? unusable.value : ''
})

function cancel() {
  forget()
  deployment.nobodyByCode = false
  emit('close')
}

async function add() {
  const identityCode = code.value.trim()
  if (!identityCode) {
    err.value = 'code'

    return
  }
  if (!parseIdentityCode(identityCode, country.value).ok) {
    err.value = 'unusable'

    return
  }
  err.value = ''
  const ok = await deployment.addDeploymentAdmin({ identityCode, country: country.value })
  if (ok) {
    forget()
    emit('close')
  }
}
</script>

<template>
  <section class="mt-4 max-w-[760px] rounded-card border border-line bg-surface px-[18px] py-4" data-block="add-admin">
    <h2 class="text-[15px] font-semibold">{{ t(w('add')) }}</h2>
    <p class="mt-1 text-[13px] text-muted-strong">{{ t(w('addLead')) }}</p>
    <div class="mt-3 grid items-baseline gap-x-3.5 gap-y-1 @min-[560px]:grid-cols-[150px_minmax(0,1fr)]">
      <label for="admin-code" class="text-[13px] text-muted-strong">{{ t('configbyte.people.users.invite.code') }}</label>
      <div data-admin="code" @input="err = ''; deployment.nobodyByCode = false">
        <IdentityCodeField
          id="admin-code"
          v-model="code"
          v-model:country="country"
          :countries="countries"
          :label="t('configbyte.people.users.invite.code')"
          :country-label="t('configbyte.people.users.invite.country')"
          :describe="describe"
          :placeholder="t('configbyte.people.users.invite.placeholder')"
          :disabled="sending"
        />
        <p v-if="problem" role="alert" class="mt-1 text-[12.5px] text-status-late-fg" data-note="admin-problem">{{ problem }}</p>
      </div>
    </div>
    <div class="mt-3.5 flex gap-2">
      <Button size="sm" :disabled="sending" data-act="add" @click="add">{{ sending ? t(w('adding')) : t(w('addDo')) }}</Button>
      <Button size="sm" variant="outline" :disabled="sending" data-act="cancel-add" @click="cancel">{{ t('configbyte.people.users.invite.cancel') }}</Button>
    </div>
  </section>
</template>
