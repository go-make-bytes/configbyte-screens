<script setup lang="ts">
// The admin app's lockup: the host's mark, a name, and the word that says which
// app this is. With the address, it is one of the two cues that tell the admin
// app from the everyday one; no colour of its own is added for it.
import { useI18n } from 'vue-i18n'
import { BrandMark } from 'uibyte'

withDefaults(defineProps<{ name: string; tone?: 'console' | 'ink'; size?: number }>(), { tone: 'console', size: 26 })

const { t } = useI18n()
</script>

<template>
  <span class="flex items-center gap-2">
    <BrandMark :tone="tone" :size="size">
      <template #default="{ size: glyph }">
        <slot :size="glyph" />
      </template>
    </BrandMark>
    <span class="flex items-baseline gap-1.5">
      <span class="text-[17px] font-bold tracking-tight">{{ name }}</span>
      <span class="font-mono text-[10.5px] uppercase tracking-wide text-console-accent">{{ t('configbyte.frame.admin') }}</span>
    </span>
  </span>
</template>
