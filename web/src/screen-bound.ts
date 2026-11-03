// Screen-bound stored values: attributes the game rewrites only while one screen (or scene) is open, so a save taken on
// another screen holds the value of the last visit. This file is the single list of them (CLAUDE.md "Live-save tests").
// writer: the CurrentlyViewedScreen id(s) of the scene that writes it (ids in data/screens.json), or 'mastery-scene' for the
// Mastery scene, which sets none. at: the writer in Qno2x.js. model: 'module#export' that recomputes it, when one exists;
// exact: the tests confirm that model equals the stored value on a fresh save, so stored vs model can judge staleness.
// reads: registry values the writer reads as stored; a stale one makes this value stale even on its writer's screen.
// App rule: with a model, use the stored value only when fresh (current()), else the model.
type Save = Record<string, unknown>
export type Bound = { writer: number | number[] | 'mastery-scene'; at: string; model?: string; exact?: boolean; reads?: string[] }

const SPIRIT = 'SceneEvents_27 runLater 30/50 @21245136/@21256531, then runPeriodically 500 @21274672'
const SKILLER = 'SceneEvents_27 runPeriodically 500 @21274672, draw @21348226'
export const SCREEN_BOUND: Record<string, Bound> = {
  MasteryBonuses: { writer: 'mastery-scene', at: 'SceneEvents_48 runPeriodically(2e3) @29901047', model: 'load-bonuses#masteryBonuses', exact: true },
  // Also written by the raid/crusade/Asylum scenes' DPS listeners (@19999256, @23403120, @26992559); the model is the main fight's.
  // Not exact: on screen 8 the stored value carries the skill-10 buff (@2590856) and the lab drift (fighting.test.ts).
  DPS: { writer: 8, at: 'SceneEvents_9 DPS listener @31880404', model: 'fighting#fightStats' },
  // The init multiplies by the stored MasteryBonuses[3] (@31676607), so a stale MasteryBonuses leaves it off by the same ratio.
  CriticalDamage: { writer: 8, at: 'ActorEvents_294/300 @8683032/@8685095 (YourCriticalDamage, SceneEvents_9 init @31677036)', model: 'fighting#fightStats', exact: true, reads: ['MasteryBonuses'] },
  // The away payout reads CalibrationValues[6] as stored (@27225189), so the app keeps it; what moves on off screen 20 are the
  // inputs it was measured with (trek-vessels.test.ts).
  CalibrationValues: { writer: 20, at: 'Trek calibration end @27516161' },
  SpiritChance: { writer: 9, at: SPIRIT, model: 'spiriting#withSpirit', exact: true },
  CultistEventBonusPercent: { writer: 9, at: SPIRIT, model: 'spiriting#withSpirit', exact: true },
  CultistSoulBonusPercent: { writer: 9, at: SPIRIT, model: 'spiriting#withSpirit', exact: true },
  AcolyteSoulBonusPercent: { writer: 9, at: SPIRIT, model: 'spiriting#withSpirit', exact: true },
  SoulConversionChanceTOTAL: { writer: 9, at: SPIRIT, model: 'spiriting#conversion', exact: true },
  SoulsConvertedTOTAL: { writer: 9, at: SPIRIT, model: 'spiriting#conversion', exact: true },
  SpiritExpGivenC: { writer: 9, at: SKILLER, model: 'spiriting#skillerStats', exact: true },
  SpiritExpGivenA: { writer: 9, at: SKILLER, model: 'spiriting#skillerStats', exact: true },
  SoulsGiven: { writer: 9, at: SKILLER, model: 'spiriting#skillerStats', exact: true },
  SoulsGivenAco: { writer: 9, at: SKILLER, model: 'spiriting#skillerStats', exact: true },
  CultistAnimationSpeed: { writer: 9, at: SKILLER, model: 'spiriting#skillerStats', exact: true },
  AcolyteAnimationSpeed: { writer: 9, at: SKILLER, model: 'spiriting#skillerStats', exact: true },
  PbonusLimboLuck: { writer: [8, 17], at: 'SceneEvents_9 init @31658978, SceneEvents_37 init @26007961', model: 'load-bonuses#potionBonuses', exact: true },
  ApothecaryExpGivenBONUS: { writer: 17, at: 'SceneEvents_37 runLater 30 @24880362', model: 'apothecary-exp#expBonus', exact: true },
  'PotionBrewSpeedBOOST[1]': { writer: 17, at: 'SceneEvents_37 init @24876477', model: 'load-bonuses#brewSpeedBoost', exact: true },
  // Orb energy is clamped to the cap only while the Realm screen draws it. No model: off screen the stored value is the energy
  // held (the next Realm draw trims any excess), and realm.ts orbCap leaves out the cap multipliers, so it can't clamp it.
  'RealmStuff[26]': { writer: 24, at: 'Realm draw clamp @6935978' },
}

const stored = (s: Save, key: string) => {
  const [, k, i] = key.match(/^(\w+)(?:\[(\d+)\])?$/)!
  const v = s[k!] as unknown
  return i == null ? v : (v as unknown[] | undefined)?.[+i]
}
/** model agrees with stored to 1e-9 (relative; absolute when stored is 0), over the model's entries. */
const same = (m: unknown, v: unknown): boolean =>
  Array.isArray(m) ? Array.isArray(v) && m.every((x, i) => same(x, v[i])) : Math.abs(Number(v) ? Number(m) / Number(v) - 1 : Number(m)) <= 1e-9

/** Is the save's stored `key` current? On its writer's screen, yes. `model` (an exact model's value) also must agree: the only
 *  test for the Mastery scene, and the catch for a save taken there after another screen (it keeps that screen's id). The values
 *  it `reads` must be fresh too, judged with `inputs` (their models; a Mastery-scene input without one counts as stale). */
export function fresh(s: Save, key: string, model?: unknown, inputs: Record<string, unknown> = {}): boolean {
  const b = SCREEN_BOUND[key]!, v = stored(s, key)
  if (v == null) return false
  if (model !== undefined && !b.exact) throw new Error(`${key}: model not exact, can't judge staleness`)
  if (b.reads?.some((k) => !fresh(s, k, inputs[k], inputs))) return false
  if (b.writer === 'mastery-scene') return model !== undefined && same(model, v)
  return [b.writer].flat().includes(Number(s.CurrentlyViewedScreen)) && (model === undefined || same(model, v))
}

/** The value to use: stored when fresh, else the model. */
export function current<T>(s: Save, key: string, model: () => T): T {
  if (SCREEN_BOUND[key]!.writer !== 'mastery-scene') return fresh(s, key) ? (stored(s, key) as T) : model()
  const m = model()
  return fresh(s, key, m) ? (stored(s, key) as T) : m
}

/** Registry keys stale in this save (screen check; the Mastery scene is judged by `models`, e.g. { MasteryBonuses: [...] }). */
export const staleKeys = (s: Save, models: Record<string, unknown> = {}) =>
  Object.keys(SCREEN_BOUND).filter((k) => stored(s, k) != null && !fresh(s, k, models[k], models))
