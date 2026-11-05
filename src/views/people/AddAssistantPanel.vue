<script setup lang="ts">
// Add an assistant: a name, unique in the workspace, and the one person it is for,
// chosen now and never changed after. It starts in the role the register gives
// it. Once added, it opens beside the list with what was said.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Button, SelectField, TextField, type SelectOption } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { PEOPLE_ASSISTANT } from '../../routes'
import { usePeople } from '../../stores/people'
import { nameProblem } from './assistantName'

const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const router = useRouter()
const people = usePeople()
const w = (key: string) => `configbyte.people.assistants.add.${key}`

const name = ref(t(w('suggested'), { n: people.assistants.length + 1 }))
const person = ref('')
const err = ref('')
const sending = ref(false)

/** Only an active person may have an assistant: never a machine, an assistant, or someone removed or not yet signed in. */
const options = computed<SelectOption[]>(() =>
  people.people
    .filter((m) => m.status === 'active')
    .sort((a, b) => a.displayName.localeCompare(b.displayName, locale.value))
    .map((m) => ({ value: m.id, label: m.displayName })),
)

async function send() {
  const trimmed = name.value.trim()
  const problem = nameProblem(trimmed)
  if (problem) {
    err.value = t(`configbyte.people.refused.${problem}`)

    return
  }
  const chosen = people.people.find((m) => m.id === person.value && m.status === 'active')
  if (!chosen) {
    err.value = t(w('errPerson'))

    return
  }
  err.value = ''
  sending.value = true
  const id = await people.addAssistant({ name: trimmed, person: chosen })
  sending.value = false
  if (!id) return
  emit('close')
  void router.push({ name: PEOPLE_ASSISTANT, params: { id } })
}

function cancel() {
  people.said = null
  emit('close')
}

const row = 'grid items-baseline gap-x-3.5 gap-y-1 @min-[560px]:grid-cols-[150px_minmax(0,1fr)]'
</script>

<template>
  <section class="mt-4 max-w-[760px] rounded-card border border-line bg-surface px-[18px] py-4" data-block="assistant-add" :aria-label="t(w('open'))">
    <h3 class="text-[17px] font-semibold">{{ t(w('open')) }}</h3>
    <p class="mt-1 text-[13px] text-muted-strong">{{ t(w('lead')) }}</p>

    <div class="mt-3 grid gap-3">
      <div :class="row">
        <label for="assistant-name" class="text-[13px] text-muted-strong">{{ t(w('name')) }}</label>
        <span>
          <TextField id="assistant-name" v-model="name" autocomplete="off" :disabled="sending" data-assistant="name" @input="err = ''" />
          <small class="mt-1 block text-[12.5px] text-muted-strong">{{ t(w('nameNote')) }}</small>
        </span>
      </div>
      <div :class="row">
        <label for="assistant-for" class="text-[13px] text-muted-strong">{{ t(w('for')) }}</label>
        <span>
          <SelectField
            id="assistant-for"
            v-model="person"
            :options="options"
            :placeholder="t(w('choose'))"
            :aria-label="t(w('for'))"
            :disabled="sending"
            data-assistant="for"
            size="sm"
            @update:model-value="err = ''"
          />
          <small class="mt-1 block text-[12.5px] text-muted-strong">{{ t(w('forNote')) }}</small>
        </span>
      </div>
    </div>

    <p v-if="err" role="alert" class="mt-3 border-l-2 border-status-late py-0.5 pl-2.5 text-[12.5px] text-status-late-fg" data-note="assistant-problem">
      {{ err }}
    </p>
    <SaidLine v-else-if="people.said?.kind === 'refused'" :said="people.said" class="mt-3" />

    <div class="mt-3.5 flex gap-2">
      <Button size="sm" :disabled="sending" data-act="assistant-add" @click="send">{{ t(w('submit')) }}</Button>
      <Button size="sm" variant="outline" :disabled="sending" data-act="assistant-add-cancel" @click="cancel">{{ t(w('cancel')) }}</Button>
    </div>
  </section>
</template>
