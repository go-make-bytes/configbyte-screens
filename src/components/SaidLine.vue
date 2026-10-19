<script setup lang="ts">
// What the last act did, or why it was refused, in a sentence of its own.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ActLine } from 'uibyte'

import type { Said } from '../stores/people'

const props = defineProps<{ said: Said }>()

const { t } = useI18n()

/**
 * A sentence that counts something reads in the plural its count asks for; one
 * that names a language names it in the reader's own word for it; one the host
 * worded is read from the host's translator.
 */
const words = computed(() => {
  const key = props.said.hostKey ?? `configbyte.people.${props.said.kind}.${props.said.key}`
  const language = props.said.language
  const values = language ? { ...props.said.values, language: t(`configbyte.people.inLanguage.${language}`) } : props.said.values
  const n = values.n

  return typeof n === 'number' ? t(key, values, n) : t(key, values)
})
</script>

<template>
  <ActLine :data-said="said.kind" :outcome="said.kind === 'refused' ? 'refused' : 'done'" :text="words" />
</template>
