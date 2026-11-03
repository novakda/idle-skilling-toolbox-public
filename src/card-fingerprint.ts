import { createHash } from "crypto";

/**
 * Derived files record a fingerprint of the save fields they depend on; the dev server re-runs the
 * generator when the live save's fingerprint differs. `owned:` fields hash only which entries are > 0.
 */
export const DERIVED: Record<string, { script: string; fields: string[] }> = {
  "game/cards.json": { script: "src/derive-cards.ts", fields: ["CardLevels", "CardEquipped", "DeckLinkList", "CardDecksOWNED", "CardDeckSelected", "CardHolderWhichCard", "MTXcardSlotsUnlocked", "aa15"] },
  "game/potions.json": { script: "src/derive-potions.ts", fields: ["PotionLV", "NewPotionID"] },
  // Keys the Realm blocks actually read (traced via getGameAttribute over a full writeRealmCombat run, 2026-10-23); RealmStuff holds the barn, blessings, HP and energy.
  "realm-combat.json": { script: "src/realm-combat.ts", fields: ["RealmStuff", "ConstructLV", "CustomLists", "CustomMaps", "IceCreamsBeaten", "Letter2Number", "SmithingItemLevel"] },
  "game/discovery.json": { script: "src/derive-discovery.ts", fields: ["PotionLV", "owned:SeedsOwned", "owned:flowersOwned"] },
};

export function fingerprint(save: Record<string, unknown>, fields: string[]) {
  const vals = fields.map((f) => {
    if (!f.startsWith("owned:")) return save[f];
    return ((save[f.slice(6)] as number[]) ?? []).map((v) => (v > 0 ? 1 : 0));
  });
  return createHash("sha1").update(JSON.stringify(vals)).digest("hex");
}

export const cardFingerprint = (save: Record<string, unknown>) => fingerprint(save, DERIVED["game/cards.json"]!.fields);
