<script setup lang="ts">
// What the last act did, or why it was refused, in a sentence of its own.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Said } from '../stores/people'

const props = defineProps<{ said: Said }>()

const { t } = useI18n()

/**
 * A sentence that counts something reads in the plural its count asks for; one
 * that names a language names it in the reader's own word for it.
 */
const words = computed(() => {
  const key = `configbyte.people.${props.said.kind}.${props.said.key}`
  const language = props.said.language
  const values = language ? { ...props.said.values, language: t(`configbyte.people.inLanguage.${language}`) } : props.said.values
  const n = values.n

  return typeof n === 'number' ? t(key, values, n) : t(key, values)
})
</script>

<template>
  <p
    :role="said.kind === 'refused' ? 'alert' : 'status'"
    :data-said="said.kind"
    class="mt-3 rounded-card border px-3 py-2 text-[13px]"
    :class="
      said.kind === 'refused'
        ? 'border-status-late-border bg-status-late-bg text-status-late-fg'
        : 'border-status-ontrack-border bg-status-ontrack-bg text-status-ontrack-fg'
    "
  >
    {{ words }}
  </p>
</template>
