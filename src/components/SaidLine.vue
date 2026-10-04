<script setup lang="ts">
// What the last act did, or why it was refused, in a sentence of its own.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Said } from '../stores/people'

const props = defineProps<{ said: Said }>()

const { t } = useI18n()

/** A sentence that counts something reads in the plural its count asks for. */
const words = computed(() => {
  const key = `configbyte.people.${props.said.kind}.${props.said.key}`
  const n = props.said.values.n

  return typeof n === 'number' ? t(key, props.said.values, n) : t(key, props.said.values)
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
