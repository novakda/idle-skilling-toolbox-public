// Heavy Cash, the Asylum shrine with id 5 (ShrineLevels[5], HeavyCashToggle = how many times you clicked its "+").
// Game code is bundle Qno2x.js (offsets † are in it). Toggle range: + needs toggle < min(level, 50) (†26529949), - needs > 0 (†26528624).
//   cash:  SmithingBonusCash *= max((1.25 + level/200)^toggle, 1)   (†3961815, same line in the 5 other copies of that formula)
//   speed: zone type 2 only, when level > 1: dpsspeed /= 2·0.8^min(toggle, 50)   (†31804196 / †31804468; the HUD shows it as "+X% SPEED")
// SmithingBonusCash is the only cash term the toggle touches, and defaultgold (cash per kill) is linear in it
// (†31777712 zone 1, †31805600 zone 2), so one monster's cash per kill scales exactly with the cash multiplier.
// Net: speed ×2·0.8^t and cash ×(1.25+L/200)^t give cash/h ×2·(1+0.004·L)^t before the 40 hits/s cap, so every click
// pays more cash per hour than the last; what it costs is kills (and everything else per kill) per hour.
import { awayGainsPerHour } from './away'

type Save = Record<string, any>
const n = (v: unknown) => Number(v ?? 0) || 0
const fl = Math.floor

export const HC_SHRINE = 5

export const cashMult = (level: number, t: number) => Math.max(Math.pow(1.25 + level / 200, t), 1)
/** Idle-hit rate multiplier vs the toggle-0 rate of the same zone (1 unless zone type 2 and level > 1, where toggle 0 is already ×2). */
export const speedMult = (zone: number, level: number, t: number) => (zone === 2 && level > 1 ? 2 * Math.pow(0.8, Math.min(t, 50)) : 1)

/** defaultgold for monster (mode m, level L) at SmithingBonusCash S; null for the modes the port doesn't cover (zone 2 mode 20, other zones). */
export function monsterCash(save: Save, zone: number, m: number, L: number, S: number): number | null {
  const sk = (k: string, i: number) => n(save[k]?.[i]), asc = 1 + 0.5 * sk('AscentionLevel', 10), rage = 1 + 0.2 * sk('SkillLevels', 50) * sk('SkillActive', 16)
  const band = (b: number) => (1 + 3 * (fl((m + 97) / 100) - fl((m + b) / 100))) * (1 + 9 * (fl((m + 96) / 100) - fl((m + b) / 100))) * (1 + 5 * (fl((m + 95) / 100) - fl((m + b) / 100)))
  if (zone === 1) {
    const g = fl(m / 10)
    return (Math.ceil((L ** (2 + 0.15 * m) + 12 * (m + 1) * L) * m * (40 * g + 1) * m + (850 * (3.8 ** (m - 1) - 1) * (1 - g) + 5e3 * g * (L + 1) + 25)) * S * (1 - g)
      + 250 * (L + 1) * 1.27 ** L * g * S) * asc * band(90) * rage
  }
  if (zone === 2 && m !== 20) {
    const g = fl(m / 20)
    const Y = (L ** (2 + 0.15 * (m - 5)) + 12 * (m - 5 + 1) * L) * m * (40 * g + 1) * (m - 5) + (850 * (3.8 ** (m - 6) - 1) * (1 - g) + 5e3 * g * (L + 1) + 25)
    const B = (Y * S * (1 - g) + 250 * (L + 1) * 1.27 ** L * g * S) * asc * band(80) * rage * (7 + 30 * (m - 11)) * 1.03 ** (L + 55 * (m - 11)) * (1 + 1.05 ** L * fl((m + 85) / 100))
    return B / 1.02 ** Math.max(L - 55, 0) * (1 + 4 * fl((m + 86) / 100))
  }
  return null
}

/** One row per toggle value 0..max for a monster (default: the current one). `away` (cash/h while away) only for the current monster. */
export function heavyCash(save: Save, sel?: { mode: number; level: number }) {
  const level = n(save.ShrineLevels?.[HC_SHRINE]), t0 = n(save.HeavyCashToggle), zone = n(save.FightZoneTYPE)
  const max = Math.min(level, 50), mode = sel?.mode ?? n(save.currentfightmode), lv = sel?.level ?? n(save.mapleLV)
  const current = mode === n(save.currentfightmode) && lv === n(save.mapleLV)
  // Anchor on the stored defaultgold (SmithingBonusCash in a save drifts between recalculations; defaultgold is what the fight uses),
  // and scale to another monster by the ratio of the ported formulas (linear in S, so S = 1 is enough).
  const cur = monsterCash(save, zone, n(save.currentfightmode), n(save.mapleLV), 1), pick = monsterCash(save, zone, mode, lv, 1)
  const base = cur && pick ? n(save.defaultgold) / cashMult(level, t0) * pick / cur : current ? n(save.defaultgold) / cashMult(level, t0) : null
  const baseSpeed = speedMult(zone, level, t0)
  const rows = Array.from({ length: max + 1 }, (_, t) => {
    const gold = base == null ? null : base * cashMult(level, t), sp = speedMult(zone, level, t) / speedMult(zone, level, 0)
    const away = current && gold != null && level > 0 ? awayGainsPerHour({ ...save, defaultgold: gold, dpsspeed: n(save.dpsspeed) * baseSpeed / speedMult(zone, level, t) }) : null
    return { t, cashMult: cashMult(level, t), speedMult: sp, cash: gold, rate: cashMult(level, t) * sp, away }
  })
  return { level, toggle: t0, zone, mode, monsterLevel: lv, current, rows, covered: base != null }
}
