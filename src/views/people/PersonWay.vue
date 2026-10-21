<script setup lang="ts">
// What names the person: their email, or their personal code and its country,
// masked, and shown whole only on a press — for an active member; an invited
// one's code stays masked. A showing is recorded by the register
// before it answers, so a code that could not be recorded is not shown. The code
// is held here, while shown, and nowhere else: it is dropped on Hide, when another
// person opens and when this panel goes.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'uibyte'

import { maskOf, wayOf } from '../../lib/people'
import { usePeople, type Member } from '../../stores/people'

const props = defineProps<{ member: Member }>()

const { t, te } = useI18n()
const people = usePeople()
const w = (key: string) => `configbyte.people.users.way.${key}`

const way = computed(() => wayOf(props.member))
/** Only an active member has their code shown; an invitation is anyone's to send. */
const showable = computed(() => props.member.status === 'active')

/** The code while it is shown; null while it is hidden. */
const shown = ref<string | null>(null)
/** Why the last press did not show it, as the key of its words. */
const refused = ref('')
const asking = ref(false)
/** Counts what was dropped, so an answer that arrives after another person opened is let go. */
let epoch = 0

function drop() {
  epoch += 1
  shown.value = null
  refused.value = ''
  asking.value = false
}

watch(() => props.member.id, drop)
onBeforeUnmount(drop)

const country = computed(() => {
  const code = way.value?.kind === 'code' ? way.value.country : ''
  const key = w(`country.${code}`)

  return te(key) ? t(key) : code
})

const masked = computed(() => (way.value?.kind === 'code' ? way.value.mask : maskOf(0)))

async function toggle() {
  if (shown.value !== null) {
    drop()

    return
  }
  const mine = ++epoch
  refused.value = ''
  asking.value = true
  const answer = await people.revealCode(props.member)
  if (mine !== epoch) return
  asking.value = false
  if (answer.ok) shown.value = answer.code
  else if (answer.why === 'notAdministrator' || answer.why === 'unanswered' || answer.why === 'unreadable') refused.value = `configbyte.people.refused.${answer.why}`
  else refused.value = w(`refused.${answer.why}`)
}
</script>

<template>
  <div v-if="way" class="border-t border-line px-[18px] py-3" data-block="way">
    <template v-if="way.kind === 'email'">
      <span class="mb-1.5 block text-[13px] text-muted-strong">{{ t(w('email')) }}</span>
      <p class="break-all font-mono text-[13px]" dir="auto" data-way="email">{{ way.email }}</p>
    </template>

    <template v-else-if="way.kind === 'code'">
      <div class="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2.5 rounded-[10px] border border-line bg-band px-3 py-2.5">
        <div>
          <p class="text-[13px] text-muted-strong">{{ t(w('codeOf'), { country }) }}</p>
          <p class="mt-0.5 font-mono text-[13px] tracking-[0.04em]" :class="shown === null ? 'text-faint' : ''" data-way="code">
            {{ shown ?? masked }}
          </p>
        </div>
        <Button v-if="showable" size="sm" variant="outline" :disabled="asking" :aria-pressed="shown !== null" data-act="reveal-code" @click="toggle">
          {{ shown === null ? t(w('reveal')) : t(w('hide')) }}
        </Button>
      </div>
      <p v-if="showable" class="mt-2 text-[12px] text-muted-strong" data-note="audit">{{ t(w('audit')) }}</p>
      <p v-if="refused" role="alert" class="mt-2 text-[12.5px] text-status-late-fg" data-note="code-refused">{{ t(refused) }}</p>
    </template>

    <template v-else>
      <p class="font-semibold">{{ t(w('none')) }}</p>
      <p class="mt-0.5 text-[12.5px] text-muted-strong">{{ t(w('noneN')) }}</p>
    </template>
  </div>
</template>
