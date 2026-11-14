<script setup lang="ts">
// The page that asks which workspace to work in, for a person who is in several and is
// signed in to none yet: the title, one line of lead, a line above the rows when
// something has to be said first, the rows, and Sign out.
//
// It draws and asks; it knows no store and makes no call. The host passes the rows
// and every word already translated, and is told which row was pressed. It sits in the
// sign-in page's column with the same slot for the product's mark, so a host can show it
// in its own sign-in look.
import { ActLine, BrandMark, Button, ChoiceRows } from 'uibyte'

export interface WorkspaceRow {
  key: string
  label: string
}

withDefaults(
  defineProps<{
    /** The workspaces to choose from, in the order to draw them. */
    rows: WorkspaceRow[]
    /** The key of the row a sign-in is under way for; empty when none is. */
    busy?: string
    /** The product's name, beside its mark. */
    product: string
    /** A short tag after the name, e.g. which app this is. */
    tag?: string
    title: string
    lead: string
    /** The rows' accessible name. */
    listLabel: string
    /** The words of the button that signs out. */
    signOutLabel: string
    /** What has to be said before the rows, if anything. */
    line?: { outcome: 'done' | 'refused'; text: string } | null
  }>(),
  { busy: '', tag: undefined, line: null },
)

const emit = defineEmits<{ choose: [key: string]; signOut: [] }>()
</script>

<template>
  <main class="@container/page min-h-screen" data-page="choose-workspace">
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
      <p class="mt-2 text-[14px] text-muted-strong">{{ lead }}</p>

      <ActLine v-if="line" class="mt-[18px]" :outcome="line.outcome" :text="line.text" data-line="workspace" />

      <ChoiceRows class="mt-[22px]" :items="rows" :label="listLabel" :busy="busy || undefined" @choose="(key: string) => emit('choose', key)" />

      <div class="mt-5">
        <Button variant="ghost" size="sm" data-act="sign-out" @click="emit('signOut')">{{ signOutLabel }}</Button>
      </div>
    </div>
  </main>
</template>
