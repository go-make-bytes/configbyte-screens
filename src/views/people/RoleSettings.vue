<script setup lang="ts">
// The host's own settings that name one of the workspace's roles, each drawn as a
// choice among the roles. A change is written at once and said in the host's
// sentence, or the refusal in words. A setting that could not be read says so
// where it stands and offers no choice.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { SelectField, type SelectOption } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { ApiError } from '../../lib/api'
import type { RoleSetting } from '../../options'
import { usePeople, type Said } from '../../stores/people'

const props = defineProps<{ settings: RoleSetting[] }>()

const { t } = useI18n()
const people = usePeople()
const w = (key: string) => `configbyte.people.roles.${key}`

/** What each setting said after its last change. */
const said = ref<Record<string, Said>>({})

onMounted(() => void people.readSettings(props.settings))

const roleOptions = computed<SelectOption[]>(() => people.roles.map((r) => ({ value: r.id, label: r.name })))

async function choose(setting: RoleSetting, id: string) {
  const role = people.roles.find((r) => r.id === id)
  // Choosing none is not an act: a setting always names a role once it has one.
  if (!role) return
  try {
    await setting.write(id)
    people.settings[setting.key] = { state: 'read', roleId: id }
    said.value[setting.key] = { kind: 'said', key: '', hostKey: setting.saved, values: { role: role.name } }
  } catch (e) {
    said.value[setting.key] =
      e instanceof ApiError && e.status === 400 && setting.refused
        ? { kind: 'refused', key: '', hostKey: setting.refused, values: { role: role.name } }
        : people.refusal('setting', e, { role: role.name })
  }
}
</script>

<template>
  <section
    v-for="s in settings"
    :key="s.key"
    class="mt-4 rounded-card border border-line bg-surface px-[18px] py-3"
    :data-setting="s.key"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <b class="font-semibold">{{ t(s.word) }}</b>
      <SelectField
        v-if="people.settings[s.key]?.state === 'read'"
        :model-value="people.settings[s.key]!.roleId"
        :options="roleOptions"
        :placeholder="t(w('settingNone'))"
        :aria-label="t(s.word)"
        size="sm"
        class="w-auto min-w-[180px]"
        @update:model-value="(id) => choose(s, id)"
      />
      <span v-else-if="people.settings[s.key]?.state === 'unread'" role="alert" class="text-[13px] text-status-late-fg" data-note="setting-unread">
        {{ t(w('settingUnread')) }}
      </span>
      <span v-else role="status" class="text-[13px] text-muted-strong">{{ t(w('reading')) }}</span>
    </div>
    <p v-if="s.note" class="mt-1.5 text-[12.5px] text-muted-strong">{{ t(s.note) }}</p>
    <SaidLine v-if="said[s.key]" :said="said[s.key]!" class="mt-2.5" />
  </section>
</template>
