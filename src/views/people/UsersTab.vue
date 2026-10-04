<script setup lang="ts">
// Users: the people by what they hold, the ones who signed in and were given
// nothing yet, and one person open beside the list. Every act saves at once and
// says what it did. Machines that act in the workspace are listed apart and are
// not changed here: whoever runs the deployment sets them up.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'uibyte'

import SaidLine from '../../components/SaidLine.vue'
import { labelOf, permissionName } from '../../lib/boxes'
import { daysAgo } from '../../lib/format'
import { usePeople, type Member } from '../../stores/people'

const { t, locale } = useI18n()
const people = usePeople()
const w = (key: string) => `configbyte.people.users.${key}`

const view = ref<'people' | 'access'>('people')
const showGone = ref(false)
const confirming = ref(false)

/** The person open beside the list: the first arrival, else the first person. */
const chosenId = ref('')
const arrivals = computed(() => people.people.filter((m) => m.arrival && m.status === 'active'))
const listed = computed(() => people.people.filter((m) => showGone.value || m.status !== 'revoked'))
const chosen = computed<Member | undefined>(
  () => people.byId(chosenId.value) ?? arrivals.value[0] ?? listed.value[0],
)

function pick(m: Member) {
  chosenId.value = m.id
  confirming.value = false
  people.said = null
}

/** The user type in force: the chart position's while the person sits in one, else their own. */
const typeInForce = (m: Member) => m.chartUserType ?? m.userType

function lastSignedIn(m: Member): string {
  if (!m.lastSignedInOn) return '—'
  const n = daysAgo(m.lastSignedInOn)
  if (n === null) return m.lastSignedInOn
  if (n <= 0) return t(w('last.today'))
  if (n === 1) return t(w('last.yesterday'))

  return t(w('last.days'), { n }, n)
}

function stateOf(m: Member): string {
  if (m.status === 'invited') return t(w('marks.invited'))
  if (m.status === 'revoked') return t(w('marks.revoked'))
  if (m.arrival) return t(w('state.arrival'))

  return t(w('state.active'))
}

/** The roles a person can still be given: those they do not hold. */
const giveable = computed(() => {
  const held = new Set((chosen.value?.tenantRoles ?? []).map((r) => r.id))

  return people.roles.filter((r) => !held.has(r.id))
})

async function onUserType(event: Event) {
  const m = chosen.value
  const type = people.userTypes.find((u) => u.id === (event.target as HTMLSelectElement).value)
  if (m && type) await people.setUserType(m, type)
}

async function onGive(event: Event) {
  const select = event.target as HTMLSelectElement
  const m = chosen.value
  const role = people.roles.find((r) => r.id === select.value)
  select.value = ''
  if (m && role) await people.giveRole(m, role)
}

async function onAdministrator(event: Event) {
  const box = event.target as HTMLInputElement
  const m = chosen.value
  if (!m) return
  const ok = await people.setAdministrator(m, box.checked)
  // A refused tick goes back to what the register still holds.
  if (!ok) box.checked = m.administrator
}

async function takeAll() {
  const m = chosen.value
  confirming.value = false
  if (m) await people.takeAll(m)
}

/** A box in the words its service declares; one the vocabulary does not list stays as it travels. */
const boxWords = computed(() => {
  const words = new Map<string, string>()
  for (const s of people.services) for (const p of s.permissions) words.set(permissionName(s.key, p), labelOf(p, locale.value))

  return words
})
const boxWord = (name: string) => boxWords.value.get(name) ?? name

/** By access: who holds the Administrator checkbox, each role and each user type. */
const byAccess = computed(() => {
  const active = listed.value.filter((m) => m.status !== 'revoked')
  const names = (list: Member[]) => list.map((m) => m.displayName).join(' · ')

  return {
    administrators: { n: people.administrators.filter((m) => m.kind === 'person').length, names: names(active.filter((m) => m.administrator)) },
    roles: people.roles
      .map((r) => ({ role: r, holders: active.filter((m) => m.tenantRoles.some((x) => x.id === r.id)) }))
      .filter((g) => g.holders.length > 0),
    types: people.userTypes.map((u) => ({ type: u, holders: active.filter((m) => typeInForce(m)?.id === u.id) })),
  }
})
</script>

<template>
  <div class="mt-5">
    <!-- Signed in and given nothing: they see nothing until somebody gives them something. -->
    <section v-if="arrivals.length" class="rounded-card border border-status-approaching-border bg-status-approaching-bg px-4 py-3" data-block="arrivals">
      <h3 class="text-[14px] font-semibold">{{ t(w('arrivals.heading'), { n: arrivals.length }) }}</h3>
      <p class="mt-1 text-[13px] text-muted-strong">{{ t(w('arrivals.lead')) }}</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="m in arrivals"
          :key="m.id"
          type="button"
          class="rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium hover:border-ink"
          @click="pick(m)"
        >
          {{ m.displayName }}
        </button>
      </div>
    </section>

    <div class="mt-4 flex flex-wrap items-center gap-4">
      <span class="inline-flex rounded-lg border border-line p-0.5" role="group">
        <button
          v-for="v in (['people', 'access'] as const)"
          :key="v"
          type="button"
          :aria-pressed="view === v"
          class="rounded-md px-3 py-1 text-[13px]"
          :class="view === v ? 'bg-ink text-paper' : 'text-muted-strong'"
          @click="view = v"
        >
          {{ t(w(`views.${v}`)) }}
        </button>
      </span>
      <label class="flex items-center gap-2 text-[13px] text-muted-strong">
        <input v-model="showGone" type="checkbox" />
        {{ t(w('showGone')) }}
      </label>
    </div>

    <!-- By access: the same people, gathered by what they hold. -->
    <div v-if="view === 'access'" class="mt-4 space-y-3" data-view="access">
      <div class="rounded-card border border-line bg-surface px-4 py-3">
        <h4 class="font-semibold">{{ t(w('columns.administrator')) }} <small class="font-normal text-faint">{{ byAccess.administrators.n }}</small></h4>
        <p class="mt-1 text-[13px] text-muted-strong">{{ byAccess.administrators.names }}</p>
      </div>
      <div v-for="g in byAccess.roles" :key="g.role.id" class="rounded-card border border-line bg-surface px-4 py-3">
        <h4 class="font-semibold">{{ g.role.name }} <small class="font-normal text-faint">{{ t(w('access.role'), { n: g.holders.length }) }}</small></h4>
        <p class="mt-1 text-[13px] text-muted-strong">{{ g.holders.map((m) => m.displayName).join(' · ') }}</p>
      </div>
      <div v-for="g in byAccess.types" :key="g.type.id" class="rounded-card border border-line bg-surface px-4 py-3">
        <h4 class="font-semibold">
          {{ g.type.name }}
          <small class="font-normal text-faint">
            {{ t(w('access.type'), { n: g.holders.length }) }} ·
            {{ g.type.permissions.length ? g.type.permissions.map(boxWord).join(', ') : t(w('access.typeHoldsNothing')) }}
          </small>
        </h4>
        <p class="mt-1 text-[13px] text-muted-strong">{{ g.holders.map((m) => m.displayName).join(' · ') }}</p>
      </div>
    </div>

    <div v-else class="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" data-view="people">
      <div class="min-w-0">
        <div class="overflow-x-auto rounded-card border border-line bg-surface">
          <table class="w-full text-left text-[13.5px]">
            <thead class="border-b border-line text-[11.5px] uppercase tracking-wide text-faint">
              <tr>
                <th class="px-3 py-2 font-medium">{{ t(w('columns.name')) }}</th>
                <th class="px-3 py-2 font-medium">{{ t(w('columns.userType')) }}</th>
                <th class="px-3 py-2 font-medium">{{ t(w('columns.roles')) }}</th>
                <th class="px-3 py-2 font-medium">{{ t(w('columns.administrator')) }}</th>
                <th class="px-3 py-2 font-medium">{{ t(w('columns.last')) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in listed"
                :key="m.id"
                :data-person="m.id"
                class="cursor-pointer border-b border-line last:border-0 hover:bg-band"
                :class="[m.id === chosen?.id ? 'bg-band' : '', m.status === 'revoked' ? 'text-faint' : '']"
                @click="pick(m)"
              >
                <td class="px-3 py-2">
                  <span class="font-semibold">{{ m.displayName }}</span>
                  <span v-if="m.status === 'invited'" class="ml-2 text-[12px] text-faint">{{ t(w('marks.invited')) }}</span>
                  <span v-else-if="m.status === 'revoked'" class="ml-2 text-[12px] text-faint">{{ t(w('marks.revoked')) }}</span>
                </td>
                <td class="px-3 py-2">
                  <span v-if="typeInForce(m)" class="rounded-full bg-band px-2 py-0.5 text-[12px]">{{ typeInForce(m)!.name }}</span>
                </td>
                <td class="px-3 py-2">
                  <span v-for="r in m.tenantRoles" :key="r.id" class="mr-1 rounded-full border border-line px-2 py-0.5 text-[12px]">{{ r.name }}</span>
                  <span v-if="!m.tenantRoles.length" class="text-faint">—</span>
                </td>
                <td class="px-3 py-2">
                  <span v-if="m.administrator" class="rounded-full bg-ink px-2 py-0.5 text-[12px] text-paper">{{ t(w('columns.administrator')) }}</span>
                </td>
                <td class="px-3 py-2 text-muted-strong">{{ lastSignedIn(m) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="people.machines.length" class="mt-3 text-[12.5px] text-faint" data-block="machines">
          {{ t(w('machines'), { n: people.machines.length, names: people.machines.map((m) => m.displayName).join(' · ') }) }}
        </p>
      </div>

      <!-- One person open: what they hold, and every act on it. -->
      <aside v-if="chosen" class="rounded-card border border-line bg-surface px-4 py-4" data-panel>
        <h3 class="text-[16px] font-semibold">{{ chosen.displayName }}</h3>
        <p class="mt-0.5 text-[12.5px] text-muted-strong">
          {{ stateOf(chosen) }}<template v-if="chosen.lastSignedInOn"> · {{ t(w('panel.last'), { when: lastSignedIn(chosen) }) }}</template>
        </p>

        <p v-if="chosen.status === 'revoked'" class="mt-3 text-[13px] text-muted-strong">{{ t(w('panel.gone')) }}</p>

        <template v-else>
          <div class="mt-4">
            <label class="block text-[11.5px] uppercase tracking-wide text-faint" :for="`type-${chosen.id}`">{{ t(w('panel.userType')) }}</label>
            <select
              :id="`type-${chosen.id}`"
              class="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-[13.5px]"
              :value="chosen.userType?.id ?? ''"
              data-act="user-type"
              @change="onUserType"
            >
              <option v-for="u in people.userTypes" :key="u.id" :value="u.id">{{ u.name }}</option>
            </select>
            <p class="mt-1 text-[12px] text-muted-strong">{{ t(w('panel.userTypeNote')) }}</p>
            <p v-if="chosen.chartUserType" class="mt-1 text-[12px] text-muted-strong" data-note="chart-type">
              {{ t(w('panel.chartType'), { type: chosen.chartUserType.name }) }}
            </p>
          </div>

          <div class="mt-4">
            <span class="block text-[11.5px] uppercase tracking-wide text-faint">{{ t(w('panel.roles')) }}</span>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <span v-for="r in chosen.tenantRoles" :key="r.id" class="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[12.5px]">
                {{ r.name }}
                <button type="button" class="text-faint hover:text-ink" :aria-label="t(w('panel.take'), { role: r.name })" @click="people.takeRole(chosen, r)">×</button>
              </span>
              <span v-if="!chosen.tenantRoles.length" class="text-[13px] text-faint">{{ t(w('panel.none')) }}</span>
            </div>
            <select v-if="giveable.length" class="mt-2 w-full rounded-lg border border-line px-2 py-1.5 text-[13.5px]" data-act="give-role" @change="onGive">
              <option value="">{{ t(w('panel.give')) }}</option>
              <option v-for="r in giveable" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
            <p class="mt-1 text-[12px] text-muted-strong">{{ t(w('panel.rolesNote')) }}</p>
          </div>

          <label class="mt-4 flex cursor-pointer items-start gap-2">
            <input type="checkbox" class="mt-1" :checked="chosen.administrator" data-act="administrator" @change="onAdministrator" />
            <span>
              <span class="block font-semibold">{{ t(w('columns.administrator')) }}</span>
              <span class="block text-[12.5px] text-muted-strong">{{ t(w('panel.administratorNote')) }}</span>
            </span>
          </label>

          <SaidLine v-if="people.said" :said="people.said" />

          <div class="mt-4">
            <div v-if="confirming" class="rounded-card border border-status-late-border bg-status-late-bg px-3 py-3 text-[13px]">
              <p>{{ t(w('panel.takeAllLead'), { name: chosen.displayName }) }}</p>
              <div class="mt-2 flex gap-2">
                <Button size="sm" data-act="take-all" @click="takeAll">{{ t(w('panel.takeAllDo')) }}</Button>
                <Button size="sm" variant="outline" @click="confirming = false">{{ t(w('panel.cancel')) }}</Button>
              </div>
            </div>
            <Button v-else size="sm" variant="outline" class="text-status-late-fg" @click="confirming = true; people.said = null">
              {{ t(w('panel.takeAll')) }}
            </Button>
          </div>
        </template>

        <SaidLine v-if="people.said && chosen.status === 'revoked'" :said="people.said" />
      </aside>
    </div>
  </div>
</template>
