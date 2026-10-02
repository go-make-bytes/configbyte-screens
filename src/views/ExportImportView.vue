<script setup lang="ts">
// The whole configuration as one file: out, and back in.
//
// What this screen must never do is judge the document. Each service judges its
// own section and answers a report; the coordinator answers one outcome for the
// whole document; the screen renders both. A document lands whole or not at all,
// and exactly the document that was previewed lands — so Apply is open only
// while the preview is clean, and after any outcome but "applied" the one way on
// is to preview the same file again.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'
import { Button, DiffList, FileChip, FileDrop, StatusPill } from 'uibyte'

import { useLexicon } from '../lexicon'
import { fileSize, localDay } from '../lib/format'
import { counts, previewGroups, refusedGroups, resultLines, type Say } from '../lib/transfer'
import { useAdminOptions } from '../options'
import { useAdminSession } from '../stores/session'
import { useTransfer } from '../stores/transfer'

const { t } = useI18n()
const say: Say = (key, named, plural) => (plural === undefined ? t(key, named ?? {}) : t(key, named ?? {}, plural))
const w = (key: string) => `configbyte.transfer.${key}`
const options = useAdminOptions()
const session = useAdminSession()
const lexicon = useLexicon()
const transfer = useTransfer()

// Leaving the screen drops the file and the versions its preview answered.
onBeforeRouteLeave(() => {
  transfer.$reset()
})

/** What the file carries: the host's lines for the sections this deployment runs. */
const carries = computed(() => options.carries.filter((c) => session.order.includes(c.section)).map((c) => t(c.line)))

const columns = computed(() => ({
  part: t(w('columns.part')),
  key: t(w('columns.key')),
  status: t(w('columns.status')),
  detail: t(w('columns.detail')),
}))

/** What the chosen file says about itself, under its name. */
const fileFacts = computed<string[]>(() => {
  const facts = [fileSize(transfer.fileBytes)]
  if (transfer.about.exportedAt) facts.push(t(w('file.exported'), { day: localDay(transfer.about.exportedAt) }))
  if (transfer.about.workspace) facts.push(t(w('file.workspace'), { id: transfer.about.workspace }))

  return facts
})

const preview = computed(() => transfer.preview)
const answer = computed(() => transfer.answer)
const groups = computed(() => (preview.value ? previewGroups(preview.value, lexicon.value, say) : []))
const tally = computed(() => (preview.value ? counts(preview.value) : null))

/** The preview no longer describes what an Apply would meet. */
const stale = computed(
  () => transfer.stop?.kind === 'moved' || (answer.value !== null && answer.value.outcome === 'refused'),
)

/** A preview that stops before Apply: refused items, or a service that did not answer. */
const previewStop = computed<string>(() => {
  if (!preview.value || answer.value || transfer.stop) return ''
  if (preview.value.outcome === 'refused') {
    const n = tally.value?.refused ?? 0

    return t(w('stop.refused'), { n }, n)
  }
  if (preview.value.outcome === 'failed') return t(w('stop.failed'))

  return ''
})

/** The Apply's answer as a headline, a sentence after it, and a tone. */
const outcome = computed<{ head: string; rest: string; tone: 'ok' | 'no' | 'warn' } | null>(() => {
  const stop = transfer.stop
  if (stop?.during === 'apply') {
    if (stop.kind === 'moved') {
      return { head: t(w('outcome.moved.head')), rest: t(w('outcome.moved.rest')), tone: 'no' }
    }

    return { head: t(w('outcome.other.head')), rest: stop.reason, tone: 'no' }
  }
  if (!answer.value) return null
  const o = answer.value.outcome
  const tone = o === 'applied' ? 'ok' : o === 'partial' ? 'warn' : 'no'

  return { head: t(w(`outcome.${o}.head`)), rest: t(w(`outcome.${o}.rest`)), tone }
})

const lines = computed(() => (answer.value ? resultLines(answer.value, lexicon.value, say) : []))
const refusedAtApply = computed(() =>
  answer.value && answer.value.outcome === 'refused' ? refusedGroups(answer.value, lexicon.value, say) : [],
)

const toneClass: Record<'ok' | 'no' | 'warn', string> = {
  ok: 'border-status-ontrack',
  no: 'border-status-late',
  warn: 'border-status-blocked',
}

function onFiles(files: File[]) {
  const [file] = files
  if (file) void transfer.choose(file)
}

function apply() {
  void transfer.apply(options.onApplied)
}
</script>

<template>
  <section class="mx-auto max-w-5xl px-8 py-8">
    <p class="font-mono text-[11px] uppercase tracking-wider text-faint">{{ t('configbyte.frame.page.eyebrow') }}</p>
    <h1 class="mt-1 text-2xl font-bold tracking-tight">{{ t('configbyte.frame.exportImport') }}</h1>
    <p class="mt-2 text-muted-strong">{{ t('configbyte.frame.page.lead') }}</p>

    <div class="mt-6 grid gap-[18px] lg:grid-cols-2">
      <!-- Export -->
      <section class="rounded-card border border-line bg-surface px-5 py-[18px]">
        <h2 class="text-[15px] font-semibold">{{ t(w('export.title')) }}</h2>
        <p class="mt-2 text-[13.5px] text-muted-strong">{{ t(w('export.lead')) }}</p>
        <ul class="mt-2.5 list-disc pl-[18px] text-[13px] text-muted-strong">
          <li v-for="line in carries" :key="line">{{ line }}</li>
        </ul>
        <p class="mt-2.5 text-[13.5px] text-muted-strong">{{ t(options.never) }}</p>
        <div class="mt-3">
          <Button size="sm" :disabled="transfer.exporting" @click="transfer.exportNow()">
            {{ transfer.exporting ? t(w('export.working')) : t(w('export.action')) }}
          </Button>
        </div>
        <p v-if="transfer.exported" role="status" class="mt-3 text-[13px]">
          <span class="font-semibold">{{ transfer.exported.name }}</span>
          <span class="text-muted-strong">
            · {{ fileSize(transfer.exported.bytes) }} ·
            {{ t(w('export.sections'), { n: transfer.exported.sections }, transfer.exported.sections) }}</span
          >
        </p>
        <p v-if="transfer.exportFailed" role="alert" class="mt-3 text-[13px] text-status-late-fg">
          {{ t(w('export.failed'), { reason: transfer.exportFailed }) }}
        </p>
      </section>

      <!-- Import -->
      <section class="rounded-card border border-line bg-surface px-5 py-[18px]">
        <h2 class="text-[15px] font-semibold">{{ t(w('import.title')) }}</h2>
        <p class="mt-2 text-[13.5px] text-muted-strong">{{ t(w('import.lead')) }}</p>
        <FileDrop
          class="mt-3.5"
          :label="t(w('import.drop'))"
          :hint="t(w('import.dropHint'))"
          accept=".json,application/json"
          :disabled="transfer.working !== ''"
          @files="onFiles"
          @rejected="(_files: File[], why: 'type' | 'count') => transfer.refuseDrop(why)"
        />
        <p v-if="transfer.rejected" role="alert" class="mt-2.5 text-[13px] text-status-late-fg">
          {{ t(w(`import.rejected.${transfer.rejected}`)) }}
        </p>
      </section>
    </div>

    <!-- What the chosen document would do, and then what it did. -->
    <section v-if="transfer.fileName" class="mt-5 rounded-card border border-line bg-surface px-5 py-[18px]">
      <h2 class="text-[15px] font-semibold">{{ t(w('preview.title')) }}</h2>
      <div class="mt-3.5">
        <FileChip
          :name="transfer.fileName"
          :meta="fileFacts"
          :badge="preview?.documentEdited ? t(w('file.edited')) : undefined"
          badge-status="idle"
        />
      </div>

      <p v-if="transfer.working === 'previewing'" role="status" class="mt-4 text-[13px] text-muted-strong">
        {{ t(w('preview.working')) }}
      </p>

      <!-- Stopped before any answer about the document. -->
      <template v-if="transfer.stop?.during === 'preview'">
        <p role="alert" class="mt-4 text-[13px] text-status-late-fg">
          {{ transfer.stop.kind === 'bad' ? t(w('stop.bad')) : t(w('stop.other'), { reason: transfer.stop.reason }) }}
        </p>
        <div class="mt-3.5 flex flex-wrap gap-2">
          <Button v-if="transfer.stop.kind !== 'bad'" size="sm" @click="transfer.previewNow()">
            {{ t(w('act.again')) }}
          </Button>
          <Button size="sm" variant="ghost" @click="transfer.clearImport()">{{ t(w('act.cancel')) }}</Button>
        </div>
      </template>

      <template v-if="preview">
        <div class="mt-2" :class="stale ? 'opacity-50' : ''" :data-stale="stale || undefined">
          <DiffList :groups="groups" :columns="columns" />
          <div v-if="tally" class="mt-3.5 flex flex-wrap items-center gap-2">
            <StatusPill status="ontrack" size="sm" :label="t(w('tally.added'), { n: tally.added }, tally.added)" />
            <StatusPill status="blocked" size="sm" :label="t(w('tally.changed'), { n: tally.changed }, tally.changed)" />
            <StatusPill status="idle" size="sm" :label="t(w('tally.unchanged'), { n: tally.unchanged }, tally.unchanged)" />
            <StatusPill
              v-if="tally.refused"
              status="late"
              size="sm"
              :label="t(w('tally.refused'), { n: tally.refused }, tally.refused)"
            />
          </div>
        </div>

        <!-- Before an Apply. -->
        <template v-if="!answer && !transfer.stop">
          <p v-if="previewStop" role="alert" class="mt-3 text-[13px] text-status-late-fg">{{ previewStop }}</p>
          <div class="mt-3.5 flex flex-wrap gap-2">
            <Button v-if="preview.outcome === 'failed'" size="sm" @click="transfer.previewNow()">
              {{ t(w('act.again')) }}
            </Button>
            <Button v-else size="sm" :disabled="!transfer.applicable" @click="apply">
              {{ transfer.working === 'applying' ? t(w('act.applying')) : t(w('act.apply')) }}
            </Button>
            <Button size="sm" variant="ghost" :disabled="transfer.working !== ''" @click="transfer.clearImport()">
              {{ t(w('act.cancel')) }}
            </Button>
          </div>
        </template>
      </template>

      <!-- The Apply's one outcome. -->
      <template v-if="outcome">
        <div
          role="status"
          class="mt-3.5 rounded-r-[10px] border-l-[3px] bg-band px-3.5 py-2.5 text-[13.5px]"
          :class="toneClass[outcome.tone]"
          :data-outcome="answer?.outcome ?? transfer.stop?.kind"
        >
          <p>
            <span class="font-semibold text-ink">{{ outcome.head }}</span> {{ outcome.rest }}
          </p>
          <ul v-if="lines.length" class="mt-2 space-y-1.5">
            <li v-for="line in lines" :key="line.key" class="flex flex-wrap items-baseline gap-2 text-[13px] text-muted-strong">
              <span class="font-semibold text-ink">{{ line.title }}</span>
              <StatusPill :status="line.role" size="sm" :label="line.word" />
              <span>{{ line.sentence }}</span>
            </li>
          </ul>
        </div>
        <DiffList v-if="refusedAtApply.length" class="mt-3" :groups="refusedAtApply" :columns="columns" />

        <div class="mt-3.5 flex flex-wrap gap-2">
          <template v-if="answer?.outcome === 'applied'">
            <Button size="sm" variant="outline" @click="transfer.clearImport()">{{ t(w('act.another')) }}</Button>
          </template>
          <template v-else>
            <Button size="sm" @click="transfer.previewNow()">{{ t(w('act.again')) }}</Button>
            <Button
              v-if="answer?.outcome === 'partial'"
              size="sm"
              variant="outline"
              :disabled="transfer.exporting"
              @click="transfer.exportNow()"
            >
              {{ t(w('act.downloadNow')) }}
            </Button>
            <Button size="sm" variant="ghost" @click="transfer.clearImport()">{{ t(w('act.cancel')) }}</Button>
          </template>
        </div>
      </template>
    </section>
  </section>
</template>
