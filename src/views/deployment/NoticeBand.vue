<script setup lang="ts">
// A band that says what became of something, with its lines below: a good result, a
// result that needs a look, or a refusal. Drawn here because the kit has none; the
// colours are the kit's own status colours, so it reads as one with the rest.
withDefaults(defineProps<{ tone?: 'ok' | 'warn' | 'no' }>(), { tone: 'ok' })

const toneClass = {
  ok: 'border-l-status-ontrack bg-status-ontrack-bg',
  warn: 'border-l-status-blocked bg-status-blocked-bg',
  no: 'border-l-status-late bg-status-late-bg',
} as const
</script>

<template>
  <div
    :role="tone === 'ok' ? 'status' : 'alert'"
    :data-band="tone"
    class="rounded-card border border-line border-l-[3px] px-4 py-3 text-[13.5px]"
    :class="toneClass[tone]"
  >
    <p class="font-semibold text-ink"><slot name="title" /></p>
    <div v-if="$slots.default" class="mt-1 text-muted-strong"><slot /></div>
    <div v-if="$slots.actions" class="mt-2.5 flex flex-wrap gap-2"><slot name="actions" /></div>
  </div>
</template>
