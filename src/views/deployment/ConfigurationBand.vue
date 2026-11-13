<script setup lang="ts">
// What became of a starting configuration, in a band, with one line for each part of
// the file the answer holds. The outcome is read from the answer's own word, never
// from the status of the call that carried it: a file that was refused arrives in an
// answer that is itself a success. The parts' lines are worded by the functions the
// import's own outcome uses, so no sentence of a service is drawn as it came.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { StatusPill } from 'uibyte'

import { useLexicon } from '../../lexicon'
import { partLines, type Configuration } from '../../lib/deployment'
import NoticeBand from './NoticeBand.vue'

/** `opened`: the band speaks of an opening that started the company from the file, not of a file applied to it later. */
const props = defineProps<{ configuration: Configuration; company: string; opened?: boolean }>()

const { t } = useI18n()
const lexicon = useLexicon()
const w = (key: string) => `configbyte.deployment.${props.opened ? 'opened' : 'configuration'}.${key}`

const say = (key: string, named?: Record<string, unknown>, plural?: number) => (plural === undefined ? t(key, named ?? {}) : t(key, named ?? {}, plural))

const tone = computed(() => (props.configuration.outcome === 'applied' ? 'ok' : props.configuration.outcome === 'partial' ? 'no' : 'warn'))
const named = computed(() => ({ file: props.configuration.name, company: props.company }))
const lines = computed(() => partLines(props.configuration, lexicon.value, say))
</script>

<template>
  <NoticeBand :tone="tone" data-block="configuration" :data-outcome="configuration.outcome">
    <template #title>{{ t(w(`${configuration.outcome}.title`), named) }}</template>
    {{ t(w(`${configuration.outcome}.lead`), named) }}
    <ul v-if="lines.length" class="mt-2 grid list-none gap-1.5 p-0" data-lines>
      <li v-for="line in lines" :key="line.key" class="flex flex-wrap items-baseline gap-x-2 gap-y-1" :data-part="line.key">
        <b class="font-semibold text-ink">{{ line.title }}</b>
        <StatusPill size="sm" :status="line.role" :label="line.word" />
        <span>{{ line.sentence }}</span>
      </li>
    </ul>
  </NoticeBand>
</template>
