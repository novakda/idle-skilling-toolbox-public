<script setup lang="ts">
// "Show steps": a long instruction list as a table in a native <dialog> instead of one long line of text.
import { ref } from 'vue'
defineProps<{ title: string; cols: string[]; rows: (string | number)[][]; label?: string }>()
const dlg = ref<HTMLDialogElement | null>(null)
</script>

<template>
  <button type="button" class="steps-btn" @click="dlg?.showModal()">{{ label ?? `Show steps (${rows.length})` }}</button>
  <dialog ref="dlg" class="steps-dlg" @cancel.prevent>
    <div class="sec-head"><h3>{{ title }}</h3><button type="button" @click="dlg?.close()">Close</button></div>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">#</th><th v-for="c in cols" :key="c">{{ c }}</th></tr></thead>
      <tbody><tr v-for="(r, k) in rows" :key="k"><td class="num">{{ k + 1 }}</td><td v-for="(v, j) in r" :key="j">{{ v }}</td></tr></tbody>
    </table></div>
  </dialog>
</template>

<style scoped>
.steps-btn { margin-left: .5em; font-size: .85em; }
.steps-dlg { max-width: min(900px, 95vw); max-height: 85vh; overflow: auto; background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 8px; }
.steps-dlg::backdrop { background: rgb(0 0 0 / .45); }
</style>
