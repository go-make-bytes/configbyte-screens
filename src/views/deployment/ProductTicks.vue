<script setup lang="ts">
// One box per product a deployment sells: ticked when the company has it. The kit has
// no tick box, so it is drawn here, as the role page draws its own. A box that cannot
// be changed says why beside it, worked out from what each product needs: a product
// that needs another cannot be ticked before it, one another ticked product needs
// cannot be unticked, and one whose services have not started cannot be ticked at all.
//
// The box never changes by itself: pressing it tells the page what was asked, and the
// page decides — it may ask first, or save at once — and then draws the new state.
import { useI18n } from 'vue-i18n'

import type { Tick } from '../../lib/deployment'
import { listOf } from '../../lib/transfer'

const props = defineProps<{
  ticks: Tick[]
  /** Nothing can be changed while an act is on its way. */
  disabled?: boolean
  /** The accessible name of the group. */
  label: string
}>()
const emit = defineEmits<{ change: [key: string, on: boolean] }>()

const { t, locale } = useI18n()
const w = (key: string) => `configbyte.deployment.products.${key}`

/** Why a box cannot be changed, in words; empty when nothing stops it. */
function why(tick: Tick): string {
  const names = listOf(tick.names, locale.value)
  switch (tick.lock) {
    case 'unoffered':
      return t(w('unoffered'))
    case 'needs':
      return t(w('needs'), { names }, tick.names.length)
    case 'neededBy':
      return t(w('neededBy'), { names }, tick.names.length)
    default:
      return ''
  }
}

function pressed(tick: Tick, ev: Event) {
  // The page draws the state; a box the page did not change goes back to what it was.
  const box = ev.target as HTMLInputElement
  box.checked = tick.on
  if (!props.disabled && !tick.lock) emit('change', tick.key, !tick.on)
}
</script>

<template>
  <ul class="m-0 list-none p-0" role="group" :aria-label="label" data-block="products">
    <li v-for="tick in ticks" :key="tick.key" :data-product="tick.key">
      <label
        class="flex items-start gap-2.5 px-[18px] py-2.5"
        :class="tick.lock && !tick.on ? 'text-muted' : 'cursor-pointer'"
      >
        <input
          type="checkbox"
          class="mt-1"
          :checked="tick.on"
          :disabled="disabled || !!tick.lock"
          :data-tick="tick.key"
          :aria-describedby="why(tick) ? `why-${tick.key}` : undefined"
          @change="pressed(tick, $event)"
        />
        <span class="min-w-0">
          <b class="font-semibold"><bdi>{{ tick.name }}</bdi></b>
          <span v-if="why(tick)" :id="`why-${tick.key}`" class="mt-0.5 block text-[12.5px] text-muted-strong" data-note="why">{{ why(tick) }}</span>
        </span>
      </label>
    </li>
  </ul>
</template>
