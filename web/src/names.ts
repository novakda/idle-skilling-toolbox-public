// In-game names for things the save stores by index (#2674), so labels read "Dragoneye Charm", not "smith item 56".
// Sources: smithing-names.json (derive-smithing.ts, anvil titles in SceneEvents_6), perks.json (AscentionLevel[i] = perk i),
// potion-catalog.json (PotionLV[i] is potion id i + 1), shrines.json (ShrineLevels[i] = Asylum shrine id i), realm.json.
import smith from './data/smithing-names.json'
import perks from './data/perks.json'
import potions from './data/potion-catalog.json'
import shrines from './data/shrines.json'
import realm from './data/realm.json'

/** SmithingItemLevel[i]. */
export const smithName = (i: number) => (smith as Record<string, string>)[i] ?? `smithing item ${i}`
/** AscentionLevel[i] (AP perks and BP perks share the array). */
export const ascName = (i: number) => (perks as { i: number; name: string | null }[]).find((p) => p.i === i)?.name ?? `ascension perk ${i}`
/** PotionLV[i]: the potion whose catalog id is i + 1. */
export const potionName = (lvIndex: number) => (potions as { id: number; name: string }[]).find((p) => p.id === lvIndex + 1)?.name ?? `potion ${lvIndex + 1}`
/** ShrineLevels[i]. */
export const asylumShrine = (i: number) => (shrines.shrines as { id: number; name: string }[]).find((s) => s.id === i)?.name ?? `Asylum shrine ${i}`
/** RealmStuff[13][i] (Realm shrines) and RealmStuff[8][i] (vending machine). */
export const realmShrine = (i: number) => (realm.shrine as { name: string }[])[i]?.name ?? `Realm shrine ${i}`
export const vendingName = (i: number) => (realm.vending as { name: string }[])[i]?.name ?? `vending ${i}`
