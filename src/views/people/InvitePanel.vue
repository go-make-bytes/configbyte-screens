<script setup lang="ts">
// Invite a person: a name and a personal code with the country that issued it.
// The code is held here, in the form, until the invitation is sent or the form is
// closed; it goes to the register in that one request and is never kept anywhere
// else, nor written into a sentence the screen says.
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, IdentityCodeField, parseIdentityCode, TextField, type CountryGroup, type IdentityCodeError } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { usePeople } from '../../stores/people'

const emit = defineEmits<{ close: [] }>()

const { t, te } = useI18n()
const people = usePeople()
const w = (key: string) => `configbyte.people.users.invite.${key}`

/** Latvia first, the choice the form starts on, then the other two Baltic states. */
const COUNTRIES = ['LV', 'EE', 'LT']

const name = ref('')
const code = ref('')
const country = ref(COUNTRIES[0]!)
const err = ref<'' | 'name' | 'code' | 'unusable'>('')
const sending = ref(false)

const countries = computed<CountryGroup[]>(() => [
  { key: 'baltic', countries: COUNTRIES.map((c) => ({ code: c, label: `${c} · ${t(`configbyte.people.users.way.country.${c}`)}` })) },
])

/** Why a code cannot be used, in words a person can act on. */
function describe(error: IdentityCodeError, issuer: string): string {
  const key = `configbyte.people.users.way.country.${issuer}`
  const named = te(key) ? t(key) : issuer

  switch (error.problem) {
    case 'length':
      return t(w('refused.length'), { country: named, want: error.expected ?? 0, got: error.actual ?? 0 })
    case 'digits':
      return t(w('refused.digits'), { country: named })
    case 'notAPerson':
      return t(w('refused.notAPerson'), { type: error.type ?? '' })
    case 'unknownType':
      return t(w('refused.unknownType'), { type: error.type ?? '' })
    case 'ambiguous':
      return t(w('refused.ambiguous'))
    case 'malformed':
      return t(w('refused.malformed'))
    case 'countryMissing':
      return t(w('refused.countryMissing'))
  }

  return t(w('refused.empty'))
}

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
  sending.value = true
  const ok = await people.invite({ displayName, identityCode, country: country.value })
  sending.value = false
  if (!ok) return
  forget()
  emit('close')
}

function cancel() {
  forget()
  people.said = null
  emit('close')
}

const row = 'grid items-baseline gap-x-3.5 gap-y-1 @min-[560px]:grid-cols-[150px_minmax(0,1fr)]'
</script>

<template>
  <section class="mt-4 max-w-[760px] rounded-card border border-line bg-surface px-[18px] py-4" data-block="invite" :aria-label="t(w('open'))">
    <h3 class="text-[17px] font-semibold">{{ t(w('open')) }}</h3>
    <p class="mt-1 text-[13px] text-muted-strong">{{ t(w('lead')) }}</p>

    <div class="mt-3 grid gap-3">
      <div :class="row">
        <label for="invite-name" class="text-[13px] text-muted-strong">{{ t(w('name')) }}</label>
        <TextField id="invite-name" v-model="name" autocomplete="off" spellcheck="false" :disabled="sending" data-invite="name" @input="err = ''" />
      </div>
      <div :class="row">
        <label for="invite-code" class="text-[13px] text-muted-strong">{{ t(w('code')) }}</label>
        <div data-invite="code" @input="err = ''">
          <IdentityCodeField
            id="invite-code"
            v-model="code"
            v-model:country="country"
            :countries="countries"
            :label="t(w('code'))"
            :country-label="t(w('country'))"
            :describe="describe"
            :placeholder="t(w('placeholder'))"
            :note="t(w('note'))"
            :disabled="sending"
          />
        </div>
      </div>
    </div>

    <p v-if="problem" role="alert" class="mt-3 border-l-2 border-status-late py-0.5 pl-2.5 text-[12.5px] text-status-late-fg" data-note="invite-problem">
      {{ problem }}
    </p>
    <SaidLine v-if="people.said?.place === 'invite' && people.said.kind === 'refused'" :said="people.said" class="mt-3" />

    <div class="mt-3.5 flex gap-2">
      <Button size="sm" :disabled="sending" data-act="invite" @click="send">{{ t(w('submit')) }}</Button>
      <Button size="sm" variant="outline" :disabled="sending" data-act="cancel-invite" @click="cancel">{{ t(w('cancel')) }}</Button>
    </div>
  </section>
</template>
