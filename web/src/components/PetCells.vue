<script setup lang="ts">
// One pet as table cells: Pet (icon + name), Page, Position (spot from the left on that page), Lv, Genes. Pair with PET_HEAD's columns.
import { GENES, invPlace, type Pet } from '../pets'
import Icon from './Icon.vue'
defineProps<{ pet: Pet }>()
const geneText = (p: Pet) => p.genes.map((g) => GENES[g] ?? g).join(' + ') || 'none'
</script>

<template>
  <td><Icon kind="pet" :name="pet.name" /></td><td class="num">{{ invPlace(pet.slot).page }}</td><td class="num">{{ invPlace(pet.slot).col }}</td><td class="num">{{ pet.level }}</td><td>{{ geneText(pet) }}</td>
</template>
