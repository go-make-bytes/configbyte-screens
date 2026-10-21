<script setup lang="ts">
// What an administrator wrote about the person. Saved on a press and said at once;
// the people are read again so the list shows its first words.
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { NOTE_MAX } from '../../lib/people'
import { usePeople, type Member } from '../../stores/people'

const props = defineProps<{ member: Member }>()

const { t } = useI18n()
const people = usePeople()
const w = (key: string) => `configbyte.people.users.note.${key}`
const id = useId()

const draft = ref(props.member.note ?? '')
const saving = ref(false)

// Another person opened: their note, not what was typed about the last.
watch(
  () => props.member.id,
  () => {
    draft.value = props.member.note ?? ''
  },
)

// The register's answer is the note now; what was typed over it stays.
watch(
  () => props.member.note,
  (now, was) => {
    if (draft.value === (was ?? '')) draft.value = now ?? ''
  },
)

const unchanged = computed(() => draft.value === (props.member.note ?? ''))
const said = computed(() => (people.said?.place === 'note' ? people.said : null))

async function save() {
  saving.value = true
  await people.setNote(props.member, draft.value)
  saving.value = false
}

// A sentence about what was saved a moment ago is worse than none once it is edited.
function edited() {
  if (people.said?.place === 'note') people.said = null
}
</script>

<template>
  <div class="border-t border-line px-[18px] py-3" data-block="note">
    <label :for="id" class="mb-1.5 block text-[13px] text-muted-strong">{{ t(w('label')) }}</label>
    <textarea
      :id="id"
      v-model="draft"
      :maxlength="NOTE_MAX"
      :placeholder="t(w('placeholder'))"
      dir="auto"
      class="min-h-[62px] w-full resize-y rounded-[9px] border border-line bg-surface px-[11px] py-2 text-[13.5px] text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      data-field="note"
      @input="edited"
    />
    <div class="mt-2 flex flex-wrap items-center justify-between gap-2.5">
      <span class="text-[12.5px] text-muted-strong">{{ t(w('hint')) }}</span>
      <Button size="sm" variant="outline" :disabled="unchanged || saving" data-act="save-note" @click="save">{{ t(w('save')) }}</Button>
    </div>
    <SaidLine v-if="said" :said="said" class="mt-2" />
  </div>
</template>
