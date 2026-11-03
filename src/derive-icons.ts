// Icon frame maps (#36): game thing → [sheet file, frame, frames across, frames down], every one read from the game, not
// guessed. Ids only — no art is written; the browser cuts the frames from the player's own install (web/src/game-icons.ts).
// Usage: bun src/derive-icons.ts  → web/src/data/icon-maps.json
//
// resources.mbs (big-endian): the word at 12 points to the string table (count, then u32 offsets of u32-length strings).
// Field layouts are the createField order of the bundle's Mbs types:
//   MbsResource  atlasID@0 description@4 id@8 name@12 (string index)
//   MbsSprite    = MbsResource + defaultAnimation@16 readableImages@20(u8) height@21 width@25 animations@29 (list pointer)
//   MbsActorType = MbsResource + … sprite@61 …   (actor type N uses sprite N+1; ActorEvents_N is its behaviour code)
//   MbsAnimation across@0 down@4 durations@8 height@12 id@16 loop@20(u8) name@21 numFrames@25 … width@42, 50 bytes
// A list is (count u32, element type u32, elements); each sprite's animation list follows the sprite's own struct.
// Animation id N of sprite S is the file sprite-S-N.png, frame 0 top-left, row-major.
import { readFileSync, writeFileSync } from "fs";

const b = readFileSync("data/game/asar/distBuild/static/game/assets/data/resources.mbs");
const T = b.readUInt32BE(12) + 4, NSTR = b.readUInt32BE(T - 4);
const str = (k: number) => { if (k >= NSTR) return ""; const o = b.readUInt32BE(T + 4 * k); return b.toString("latin1", o + 4, o + 4 + b.readUInt32BE(o)); };

type Anim = { id: number; name: string; across: number; down: number };
const sprites = new Map<number, Anim[]>();
for (let p = 29; p + 12 < b.length; p++) {
  if (b.readUInt32BE(p) !== p + 4 || b.readInt32BE(p + 8) !== 17) continue; // animations pointer, then a list of MbsAnimation (type 17)
  const anims: Anim[] = [];
  for (let i = 0, a = p + 12, n = b.readInt32BE(p + 4); i < n; i++, a += 50)
    anims.push({ id: b.readInt32BE(a + 16), name: str(b.readUInt32BE(a + 21)), across: b.readInt32BE(a), down: b.readInt32BE(a + 4) });
  sprites.set(b.readInt32BE(p - 29 + 8), anims);
}
/** Actor type name → its sprite (MbsActorType: id = sprite - 1, name, sprite field). */
const actors = new Map<string, number>();
for (const s of sprites.keys()) {
  const k = Buffer.alloc(4); k.writeInt32BE(s);
  for (let q = b.indexOf(k); q >= 0; q = b.indexOf(k, q + 1))
    if (q >= 61 && b.readInt32BE(q - 61 + 8) === s - 1) actors.set(str(b.readUInt32BE(q - 61 + 12)), s);
}
const spriteOf = (actor: string) => { const s = actors.get(actor); if (s == null) throw new Error(`actor type "${actor}" not found`); return s; };
type Entry = [file: string, frame: number, across: number, down: number];
/** Frame `f` of the animation named `anim` (or with id `anim` when a number) of the actor's sprite. */
function frame(actor: string, anim: string | number, f = 0): Entry {
  const s = spriteOf(actor), a = sprites.get(s)!.find((x) => (typeof anim === "number" ? x.id === anim : x.name === anim));
  if (!a) throw new Error(`${actor}: no animation ${anim}`);
  if (f >= a.across * a.down) throw new Error(`${actor} ${anim}: frame ${f} out of range`);
  return [`graphics/1x/sprite-${s}-${a.id}.png`, f, a.across, a.down];
}

// Pets: the game picks the animation by pet name, setAnimation(""+PetsOwned[i]); frame 0.
const pet: Record<string, Entry> = {};
for (const a of sprites.get(spriteOf("Pets"))!) if (a.name !== "Nothing") pet[a.name] = frame("Pets", a.id);

// Raid bosses: the raid select screen (ActorEvents_461, actor RaidSelect) shows boss 1-4 unlocked as animation "1", "3",
// "5", "7" (the even ones are the locked look). Asylum bosses: ActorEvents_1269 (AsylumSelect) sets frame
// k + 4·(RaidTYPE − 2), k = 1-4, and the Asylum is RaidTYPE 2. Names as web/src/raids.ts BOSSES.
const boss: Record<string, Entry> = {
  King: frame("RaidSelect", "1"), Entertainer: frame("RaidSelect", "3"), Sentinel: frame("RaidSelect", "5"), Demon: frame("RaidSelect", "7"),
  Emigdala: frame("AsylumSelect", 0, 1), Occulon: frame("AsylumSelect", 0, 2), Scallius: frame("AsylumSelect", 0, 3), Gorshank: frame("AsylumSelect", 0, 4),
};

// Trek monsters (Pets screen): ActorEvents_1353 (PetMonsters) sets frame = monster number (MonsterSelected + 5·(page − 1)),
// capped at 157. Keyed by monster number.
const monster: Record<string, Entry> = {};
const mon = sprites.get(spriteOf("PetMonsters"))![0]!;
for (let m = 1; m <= Math.min(157, mon.across * mon.down - 1); m++) monster[m] = frame("PetMonsters", mon.id, m);

// Skills, keyed by the game's level attribute. The skill-bar icons pick a frame per screen range and draw that skill's
// level beside it: bigMINING (ActorEvents_152) miningLVL 0, FarmingLV 1, HatcheryLV 2; bigSMITHING (154) smithingLVL 0,
// ApothecaryLV 1, TrekkingLV 2, ResearchLV 3, SpelunkerLV 4, ConstructionLV 5; bigFISHING (156) fishingLVL 0, HerbloreLV 1;
// bigATK (54) atkLVL 0, strLVL 1, endLVL 2 (by row); bigSPIRIT spiritLVL; bigSUM summonLVL (one frame each).
const skill: Record<string, Entry> = {
  miningLVL: frame("bigMINING", 0, 0), FarmingLV: frame("bigMINING", 0, 1), HatcheryLV: frame("bigMINING", 0, 2),
  smithingLVL: frame("bigSMITHING", 0, 0), ApothecaryLV: frame("bigSMITHING", 0, 1), TrekkingLV: frame("bigSMITHING", 0, 2),
  ResearchLV: frame("bigSMITHING", 0, 3), SpelunkerLV: frame("bigSMITHING", 0, 4), ConstructionLV: frame("bigSMITHING", 0, 5),
  fishingLVL: frame("bigFISHING", 0, 0), HerbloreLV: frame("bigFISHING", 0, 1),
  atkLVL: frame("bigATK", 0, 0), strLVL: frame("bigATK", 0, 1), endLVL: frame("bigATK", 0, 2),
  spiritLVL: frame("bigSPIRIT", 0, 0), summonLVL: frame("bigSUM", 0, 0),
};

// Tilling crops, keyed by crop id 1-40 (PlantType / SeedsOwned index): the Tilling screen's crop list is actor
// "oresowned Copy" (ActorEvents_1104), which sets animation ""+CurrentlyViewedScreen ("15" on Tilling) and, in its draw
// listener, frame = row position + 20·DarkModeEnabled[0], the same index it reads SeedsOwned at. So crop c = frame c.
const crop: Record<string, Entry> = {};
for (let c = 1; c <= 40; c++) crop[c] = frame("oresowned Copy", "15", c);

// Rifts 1-9 (Limbo screen): actor "Rifts" (ActorEvents_835) sets animation ""+rift and frame 3 when ConstructLV[10] +
// ConstructLV[22] ≥ rift (Pro look), else 2 above level 40, 1 above 20, else 0. Keyed "rift-frame".
const rift: Record<string, Entry> = {};
for (let r = 1; r <= 9; r++) for (let f = 0; f < 4; f++) rift[`${r}-${f}`] = frame("Rifts", String(r), f);

// Crusades 1-13 (crusade select screen): actor "ConquestOfflineRewards" (ActorEvents_1048) sets frame = crusade number when it
// has victories to claim, else crusade + 13 (the dark look). Keyed by crusade number; 14-15 have no frame of their own.
const crusade: Record<string, Entry> = {};
for (let c = 1; c <= 13; c++) crusade[c] = frame("ConquestOfflineRewards", 0, c);

// Tinkering materials 1-89: a dropped material is actor "ConquestCraftingItems" (ActorEvents_1003), which sets frame =
// ConquestCraftingDroppedID, the same id CraftingMaterialsOwned is indexed by. Keyed by material id.
const material: Record<string, Entry> = {};
for (let m = 1; m <= 89; m++) material[m] = frame("ConquestCraftingItems", 0, m);

// Tinkering items 1-70 (gear, boosters, mutators): actor "ConquestCraftingEquipments" (ActorEvents_1007) shows recipe tile
// _CraftingEquipmentID with setCurrentFrame(round(_CraftingEquipmentID + 1)), the same number it stores as EquipmentSelected,
// and an equipped slot with setCurrentFrame(EquipmentEquipped[slot]). So frame = item id. Keyed by item id.
const gear: Record<string, Entry> = {};
for (let g = 1; g <= 70; g++) gear[g] = frame("ConquestCraftingEquipments", 0, g);

if (pet.bear?.[0] !== "graphics/1x/sprite-1274-2.png") throw new Error("unexpected pet sprite list");
// Menu buttons: the Realm button (ActorEvents_1472, switches to scene 51 @6383478) draws sprite 1473, whose animation 1
// is REALM (frame 0 unlocked, 1 locked; animation 0 is TUNNELS).
const navActor = [...actors].find(([, sp]) => sp === 1473)?.[0];
if (!navActor) throw new Error("realm button actor (sprite 1473) not found");
// Contracts: the board-picker scrolls (ContractSelection, sprite 937; frame k = board k, 1 = Easy, 10-14 = merit shop pages).
const nav: Record<string, Entry> = { realm: frame(navActor, 1, 0), contracts: frame("ContractSelection", 0, 1) };
// Kill-tier skulls (Bestiary): the fight screen's ActorEvents_1235 (sprite 1236) sets frame stazzImageKILLS + 30 for the kills
// line under a monster's name (@4287274 reads it; the tier writes are @7666682 ff.); 0 = the plain white skull under 100K kills, 1-4 = Bronze..Diamond.
const skullActor = [...actors].find(([, sp]) => sp === 1236)?.[0];
if (!skullActor) throw new Error("kills skull actor (sprite 1236) not found");
const skull: Record<string, Entry> = {};
for (let t = 0; t <= 4; t++) skull[t] = frame(skullActor, 0, 30 + t);
writeFileSync("web/src/data/icon-maps.json", JSON.stringify({ pet, boss, monster, skill, crop, rift, crusade, material, gear, nav, skull }));
console.log(`icon maps: ${Object.keys(pet).length} pets, ${Object.keys(boss).length} bosses, ${Object.keys(monster).length} trek monsters, ${Object.keys(skill).length} skills, ${Object.keys(crop).length} crops, ${Object.keys(rift).length} rift frames, ${Object.keys(crusade).length} crusades, ${Object.keys(material).length} materials, ${Object.keys(gear).length} tinkering items, nav: ${navActor}`);
