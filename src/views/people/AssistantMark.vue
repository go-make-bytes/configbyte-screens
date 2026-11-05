<script setup lang="ts">
// The mark a change made through an assistant carries after its person's name:
// ✦ and the assistant's name, in the pill a user type is drawn in.
import { useI18n } from 'vue-i18n'
import { Chip } from 'uibyte'

defineProps<{ name: string }>()

const { t } = useI18n()
</script>

<template>
  <Chip tone="surface" data-mark="assistant"><span aria-hidden="true">✦</span> <bdi>{{ t('configbyte.people.assistants.through', { name }) }}</bdi></Chip>
</template>
