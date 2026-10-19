<script setup lang="ts">
// By access: the same people, gathered by what they hold: the Administrator
// checkbox, each role, each user type. Each card names the first few and folds
// the rest behind one button.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FoldMore } from 'uibyte'

import { typeInForce } from '../../lib/people'
import { usePeople, type Member } from '../../stores/people'
import { useBoxes } from './useBoxes'

const { t, locale } = useI18n()
const people = usePeople()
const { typeWords } = useBoxes()
const w = (key: string) => `configbyte.people.users.${key}`

interface Card {
  key: string
  title: string
  /** What it says after the title: how many hold it, and for a user type what it holds. */
  meta: string
  holders: Member[]
}

const present = computed(() =>
  people.people.filter((m) => m.status !== 'revoked').sort((a, b) => a.displayName.localeCompare(b.displayName, locale.value)),
)

const cards = computed<Card[]>(() => {
  const administrators = present.value.filter((m) => m.administrator)

  return [
    { key: 'administrators', title: t(w('columns.administrator')), meta: String(administrators.length), holders: administrators },
    ...people.roles
      .map((role) => ({ role, holders: present.value.filter((m) => m.tenantRoles.some((r) => r.id === role.id)) }))
      .filter((g) => g.holders.length > 0)
      .map((g) => ({ key: `role-${g.role.id}`, title: g.role.name, meta: t(w('access.role'), { n: g.holders.length }), holders: g.holders })),
    ...people.userTypes.map((type) => {
      const holders = present.value.filter((m) => typeInForce(m)?.id === type.id)
      const holds = type.permissions.length ? typeWords(type.permissions).join(', ') : t(w('access.typeHoldsNothing'))

      return { key: `type-${type.id}`, title: type.name, meta: `${t(w('access.type'), { n: holders.length })} · ${holds}`, holders }
    }),
  ]
})

const more = (hidden: number) => t(w('access.more'), { n: hidden })
</script>

<template>
  <div class="mt-4 grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]" data-view="access">
    <section v-for="card in cards" :key="card.key" class="rounded-card border border-line bg-surface px-[18px] py-3">
      <h4 class="font-semibold">{{ card.title }} <small class="font-normal text-faint">{{ card.meta }}</small></h4>
      <div class="mt-1 text-[13px] leading-relaxed text-ink">
        <FoldMore v-if="card.holders.length" :items="card.holders" :more-label="more">
          <template #default="{ item }">{{ item.displayName }}</template>
        </FoldMore>
        <span v-else class="text-faint">{{ t(w('access.nobody')) }}</span>
      </div>
    </section>
  </div>
</template>
