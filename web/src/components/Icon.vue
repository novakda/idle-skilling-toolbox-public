<script setup lang="ts">
// A game thing's icon + its name (docs/ux-direction.md item 5). The name is always shown; the icon is extra, cut from the
// player's own install (or, in dev, the local game files) by game-icons.ts. No source: name only.
import { computed } from 'vue'
import { frameOf, iconUrl, type Kind } from '../game-icons'

// `id`: card id, potion id, seed/flower index or minion id; pets are looked up by name.
const props = defineProps<{ kind: Kind; name: string; id?: number | string }>()
const src = computed(() => { const f = frameOf(props.kind, props.name, props.id); return f && iconUrl(f) })
</script>

<template>
  <span class="named"><img v-if="src" class="icon" :src="src" alt="" />{{ name }}</span>
</template>

<style scoped>
.named { display: inline-flex; align-items: center; gap: 4px; vertical-align: middle; }
.icon { height: 20px; width: auto; max-width: 40px; flex: none; object-fit: contain; image-rendering: pixelated; }
</style>
