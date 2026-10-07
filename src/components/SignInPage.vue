<script setup lang="ts">
// The one sign-in page, for every app of a deployment.
//
// It draws and asks; it never calls a service. The host passes what is its own —
// its name, the page's heading and lead, a link to the everyday app, the
// languages it carries — and the ways the deployment offers, read from its edge.
// The page draws one button per way, by the way's exact name, in the order given:
// which ways there are, and what each is called, is configuration, so no name is
// written here.
//
// Everything a person can meet before using the app is said here, in the page's
// own words in each language: a sign-in cancelled or refused, not being a member
// (and what to do about it), the card software missing, having signed out, and a
// sign-in that has ended. Choosing a way is reported to the host, which runs it.
//
// A page that closes the app to a person is drawn in the same place: the host
// gives its heading and lead, and either offers no way in or adds its own, such
// as the way back.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BrandMark, Button, LanguageMenu, type LanguageOption } from 'uibyte'

import { CARD_SOFTWARE_URL } from '../lib/webeid'
import type { SignInMessage, SignInWay } from '../lib/signin'

const props = withDefaults(
  defineProps<{
    /** The product's name, beside its mark. */
    product: string
    /** A short tag after the name, e.g. which app this is. */
    tag?: string
    title: string
    lead: string
    /** A way to the everyday app, when there is one to go to. */
    link?: { label: string; href: string }
    /** The ways the deployment offers, in the order to draw them. */
    ways: SignInWay[]
    /** The languages the app carries, each named in itself. */
    languages: LanguageOption[]
    /** The language the page is in. */
    language: string
    /** What to say above the buttons. */
    message?: SignInMessage
    /** The app's name as the signed-out line reads it, e.g. "the admin app". */
    signedOutOf?: string
    /** The key of the way being waited on — the card, while the card software asks for the PIN. */
    waitingFor?: string
    /** The card software is not running on this computer. */
    softwareMissing?: boolean
    /**
     * Whether the page offers a way in. A page that closes the app to this person
     * offers none and says nothing about ways; the host's lead says why.
     */
    offers?: boolean
    /** Say, under the buttons, what choosing each way does. */
    explain?: boolean
  }>(),
  {
    tag: undefined,
    link: undefined,
    message: '',
    signedOutOf: '',
    waitingFor: '',
    softwareMissing: false,
    offers: true,
    explain: true,
  },
)

const emit = defineEmits<{ start: [way: SignInWay]; 'update:language': [code: string] }>()

const { t } = useI18n()
const s = (key: string, values?: Record<string, unknown>) => t(`configbyte.signIn.${key}`, values ?? {})

const busy = computed(() => props.waitingFor !== '')

/** What the page says, and how it says it: a refusal at once, the rest politely. */
const said = computed(() => {
  const m = props.message || (props.offers && props.ways.length === 0 ? 'noWays' : '')
  if (!m) return null
  const tone = m === 'signedOut' ? 'done' : m === 'ended' || m === 'noWays' ? 'neutral' : 'refused'

  return { key: m, tone, text: s(`message.${m}`, { app: props.signedOutOf }) }
})

/** One sentence per way, saying what choosing it does. */
const hint = computed(() => props.ways.map((w) => s(`hint.${w.flow}`, { name: w.name })).join(' '))

const tones: Record<string, string> = {
  refused: 'border-l-status-late bg-status-late-bg text-status-late-fg',
  done: 'border-l-status-ontrack bg-status-ontrack-bg text-status-ontrack-fg',
  neutral: 'border-l-ink bg-band text-ink',
}
</script>

<template>
  <main class="min-h-screen" data-page="sign-in">
    <div v-if="languages.length > 1" class="flex justify-end px-[18px] py-3.5">
      <LanguageMenu
        :languages="languages"
        :model-value="language"
        :label="s('language')"
        @update:model-value="(code: string) => emit('update:language', code)"
      />
    </div>

    <div class="mx-auto mb-10 mt-[60px] max-w-[460px] px-5">
      <div class="mb-[22px] flex items-center gap-2.5">
        <BrandMark tone="ink" :size="30" :name="product">
          <template #default="{ size }"><slot name="mark" :size="size" /></template>
        </BrandMark>
        <span
          v-if="tag"
          class="rounded-[5px] bg-console px-[7px] py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-console-accent"
        >
          {{ tag }}
        </span>
      </div>

      <h1 class="text-[25px] font-bold tracking-[-0.015em]">{{ title }}</h1>
      <p class="mt-2 text-[14px] text-muted-strong">
        {{ lead }}
        <a v-if="link" :href="link.href" class="whitespace-nowrap text-status-ontrack-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
          {{ link.label }}
        </a>
      </p>

      <p
        v-if="said"
        :role="said.tone === 'refused' ? 'alert' : 'status'"
        :data-said="said.key"
        class="mt-[18px] rounded-[8px] border-l-[3px] px-3 py-2.5 text-[13.5px]"
        :class="tones[said.tone]"
      >
        {{ said.text }}
      </p>

      <!-- Missing software is not an error to apologise for; it is a step to take. -->
      <div
        v-if="softwareMissing"
        role="alert"
        data-said="softwareMissing"
        class="mt-[18px] rounded-[8px] border-l-[3px] border-l-status-blocked bg-status-blocked-bg px-3 py-2.5 text-[13.5px] text-status-blocked-fg"
      >
        <b class="mb-0.5 block">{{ s('missing.title') }}</b>
        {{ s('missing.lead') }}
        <a :href="CARD_SOFTWARE_URL" target="_blank" rel="noreferrer noopener" class="underline">{{ s('missing.action') }}</a>
      </div>

      <div v-if="(offers && ways.length) || $slots.actions" class="mt-[22px] flex flex-col gap-2.5">
        <template v-if="offers">
          <Button
            v-for="(way, i) in ways"
            :key="way.key"
            :variant="i === 0 ? 'default' : 'outline'"
            class="w-full"
            :disabled="busy"
            :data-way="way.key"
            @click="emit('start', way)"
          >
            {{ waitingFor === way.key ? s('waiting') : way.name }}
          </Button>
        </template>
        <!-- Anything else the host offers here, e.g. the way back from a closed page. -->
        <slot name="actions" />
      </div>

      <p v-if="offers && explain && ways.length" class="mt-3.5 text-[12.5px] text-muted">{{ hint }}</p>
    </div>
  </main>
</template>
