<script setup lang="ts">
// One person open: what they hold and every act on it. Each act saves at once and
// says what it did. Taking away all access is asked first, in place.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Button, Chip, ConfirmAsk, SelectField, type SelectOption } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { HISTORY } from '../../routes'
import { usePeople, type Member } from '../../stores/people'
import { useLast } from './useLast'

const props = defineProps<{ member: Member }>()

const { t } = useI18n()
const people = usePeople()
const lastSignedIn = useLast()
const w = (key: string) => `configbyte.people.users.${key}`

const confirming = ref(false)

// Another person opened: nothing said about the last one stays.
watch(
  () => props.member.id,
  () => {
    confirming.value = false
    people.said = null
  },
  { immediate: true },
)

// The chart's positions say where the person sits, for the notes under their user type.
onMounted(() => void people.ensurePositions())

const revoked = computed(() => props.member.status === 'revoked')
const firstName = computed(() => props.member.displayName.split(/\s+/)[0] ?? props.member.displayName)

function stateOf(m: Member): string {
  if (m.status === 'invited') return t(w('marks.invited'))
  if (m.status === 'revoked') return t(w('marks.revoked'))
  if (m.arrival) return t(w('state.arrival'))

  return t(w('state.active'))
}

/** Where the person sits in the chart of authority, when the chart was read and they sit in it. */
const position = computed(() => people.positions.find((p) => p.people?.some((x) => x.userId === props.member.id)))

/** What the chart says about their user type: the one it gives, or that it gives none. */
const chartNote = computed(() => {
  const m = props.member
  const own = m.userType?.name ?? ''
  if (m.chartUserType) {
    return position.value
      ? t(w('panel.chartType'), { position: position.value.name, type: m.chartUserType.name, own })
      : t(w('panel.chartTypeNoPosition'), { type: m.chartUserType.name, own })
  }
  if (position.value) return t(w('panel.chartNoType'), { position: position.value.name })

  return ''
})

const typeOptions = computed<SelectOption[]>(() => people.userTypes.map((u) => ({ value: u.id, label: u.name })))
const roleOptions = computed<SelectOption[]>(() => {
  const held = new Set(props.member.tenantRoles.map((r) => r.id))

  return people.roles.map((r) => ({ value: r.id, label: r.name, disabled: held.has(r.id) }))
})

async function onUserType(id: string) {
  const type = people.userTypes.find((u) => u.id === id)
  if (type && type.id !== props.member.userType?.id) await people.setUserType(props.member, type)
}

async function onGive(id: string) {
  const role = people.roles.find((r) => r.id === id)
  if (role) await people.giveRole(props.member, role)
}

async function onAdministrator(event: Event) {
  const box = event.target as HTMLInputElement
  const ok = await people.setAdministrator(props.member, box.checked)
  // A refused tick goes back to what the register still holds.
  if (!ok) box.checked = props.member.administrator
}

async function takeAll() {
  confirming.value = false
  await people.takeAll(props.member)
}

const section = 'border-t border-line px-[18px] py-3'
const lab = 'mb-1.5 block text-[13px] text-muted-strong'
const link =
  'rounded-chip text-[12.5px] font-medium text-status-ontrack-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus'
</script>

<template>
  <div data-panel>
    <div class="px-[18px] pb-3 pt-3.5">
      <h3 class="text-[18px] font-semibold tracking-tight">{{ member.displayName }}</h3>
      <p class="mt-0.5 text-[12.5px] text-muted-strong">
        {{ stateOf(member) }}<template v-if="member.lastSignedInOn"> · {{ t(w('panel.last'), { when: lastSignedIn(member) }) }}</template>
      </p>
    </div>

    <div v-if="revoked" :class="section">
      <p class="text-[12.5px] text-muted-strong">{{ t(w('panel.gone')) }}</p>
      <p class="mt-2">
        <RouterLink :to="{ name: HISTORY, query: { who: member.id } }" :class="link" data-link="history">
          {{ t(w('panel.history'), { name: firstName }) }}
        </RouterLink>
      </p>
      <SaidLine v-if="people.said" :said="people.said" class="mt-3" />
    </div>

    <template v-else>
      <div :class="section">
        <SelectField
          :model-value="member.userType?.id ?? ''"
          :options="typeOptions"
          :label="t(w('panel.userType'))"
          data-act="user-type"
          size="sm"
          @update:model-value="onUserType"
        />
        <p class="mt-1.5 text-[12.5px] text-muted-strong">{{ t(w('panel.userTypeNote')) }}</p>
        <p v-if="chartNote" class="mt-2 border-l-2 border-status-closed-fg py-0.5 pl-2.5 text-[12.5px] text-status-closed-fg" data-note="chart-type">
          {{ chartNote }}
        </p>
      </div>

      <div :class="section">
        <span :class="lab">{{ t(w('panel.roles')) }}</span>
        <div class="flex flex-wrap items-center gap-1.5">
          <Chip v-for="r in member.tenantRoles" :key="r.id">
            {{ r.name }}
            <button
              type="button"
              class="rounded-chip px-0.5 text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              :aria-label="t(w('panel.take'), { role: r.name })"
              @click="people.takeRole(member, r)"
            >
              ×
            </button>
          </Chip>
          <span v-if="!member.tenantRoles.length" class="text-[13px] text-faint">{{ t(w('panel.none')) }}</span>
        </div>
        <SelectField
          class="mt-2"
          model-value=""
          :options="roleOptions"
          :placeholder="t(w('panel.give'))"
          :aria-label="t(w('panel.give'))"
          data-act="give-role"
          size="sm"
          @update:model-value="onGive"
        />
        <p class="mt-1.5 text-[12.5px] text-muted-strong">{{ t(w('panel.rolesNote')) }}</p>
      </div>

      <div :class="section">
        <label class="flex cursor-pointer items-start gap-2">
          <input type="checkbox" class="mt-1" :checked="member.administrator" data-act="administrator" @change="onAdministrator" />
          <span>
            <span class="block font-semibold">{{ t(w('columns.administrator')) }}</span>
            <span class="block text-[12.5px] text-muted-strong">{{ t(w('panel.administratorNote')) }}</span>
          </span>
        </label>
      </div>

      <SaidLine v-if="people.said" :said="people.said" class="mx-[18px] mb-1 mt-1" />

      <div :class="section">
        <ConfirmAsk
          v-if="confirming"
          :question="t(w('panel.takeAllAsk'), { name: member.displayName })"
          :detail="t(w('panel.takeAllLead'), { name: member.displayName })"
          :confirm-label="t(w('panel.takeAllDo'))"
          :keep-label="t(w('panel.cancel'))"
          danger
          @confirm="takeAll"
          @keep="confirming = false"
        />
        <div v-else class="flex flex-wrap items-center justify-between gap-2.5">
          <RouterLink :to="{ name: HISTORY, query: { who: member.id } }" :class="link" data-link="history">
            {{ t(w('panel.history'), { name: firstName }) }}
          </RouterLink>
          <Button size="sm" variant="outline" class="text-status-late-fg" @click="confirming = true; people.said = null">
            {{ t(w('panel.takeAll')) }}
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
