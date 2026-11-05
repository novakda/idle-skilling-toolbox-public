// Totals page (#2630): one stat at a time, every source that feeds it and the result combined the way the game does.
// Add a stat = add one entry to STATS (rows from the save + how they combine).
import catalog from './data/card-catalog.json'
import { cbonus, type Catalog, zoneTotalCardLV } from './modules/cards/cards-calc'
import {raidDecks } from './combat'
import { fightStats, LINK } from './modules/fighting/fighting'
import { equipmentBonuses, masteryBonuses, potionBonuses, tankBonuses } from './bus'
import { tierPerks } from './modules/botany/botany-calc'
import { fruitBonus, vendingBonus } from './modules/realm/realm'
import { ascName, potionName, smithName } from './names'
import { skillName } from './modules/skilltrees/skilltree'
import { masteryPerkName } from './modules/mastery/mastery'
import { name as building } from './modules/construction/construction'
import { RIFTS } from './modules/rift/rift'
import { hired, spelunker } from './modules/spelunking/spelunking'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
/** save[key][i], or null when the save lacks the key (shown as unknown, never guessed). */
const at = (s: Save, key: string, ...i: number[]) => {
  let v: unknown = s[key]
  for (const k of i) { if (v == null) return null; v = (v as unknown[])[k] }
  return s[key] == null ? null : n(v)
}

/** One source: `pct` = what it adds to the stat in % points, or `x` = the factor it multiplies by († read from the save);
 *  null = unknown. `cap` marks the rows a capped sub-sum holds. */
export type Row = { name: string; where: string; value: number | null; how: string; pct?: number | null; x?: number | null; cap?: boolean }
/** `flag`: a cap the total hits or a source past its own cap (the summary table shows it). */
export type Total = { value: number | null; lines: string[]; flag?: string }
export type Stat = { id: string; label: string; rows: (s: Save) => Row[]; total: (rows: Row[], s: Save) => Total
  meaning: string; show?: (v: number) => string }
const unknown = (rows: Row[]) => rows.some((r) => r.pct === null || r.x === null)
const UNKNOWN = { value: null, lines: ['A source is unknown in this save, so the total is unknown.'] }
const sig = (v: number) => (Math.abs(v) < 1e6 ? String(+v.toFixed(3)) : v.toExponential(3))

/** Chain LV chance per chain step (@18667214): p = min(shrine + Σ%/100, 0.85). One roll R = randomInt(1, 1000) per chain;
 *  step k = 1..7 (loop a = 0..6) fires when 1000·p^k ≥ R, so P(≥ k free levels) = floor(1000·p^k)/1000. */
export function chainChance(pct: number) {
  const raw = pct / 100, p = Math.min(raw, 0.85)
  const atLeast = Array.from({ length: 7 }, (_, k) => Math.max(0, Math.min(Math.floor(1000 * Math.pow(p, k + 1)), 1000)) / 1000)
  return { raw, p, atLeast, expected: atLeast.reduce((a, b) => a + b, 0) }
}

const chainRows = (s: Save): Row[] => {
  const shrine = at(s, 'ShrineLevels', 11), card = s.CardLevels == null ? null : n(cbonus(s, catalog as unknown as Catalog).CbonusChain)
  const pot = at(s, 'PotionLV', 104), skill = at(s, 'SkillLevels', 67), mast = at(s, 'MasteryPerksUnlocked', 66)
  const sahaja = at(s, 'RealmStuff', 13, 5), jaw = at(s, 'RealmStuff', 8, 15)
  const tank = s.TankLVs == null || s.PetCapsuleLV == null ? null : tankBonuses(s)[27]
  return [
    { name: 'Chain Level shrine', where: `Asylum shrine 11, level ${shrine ?? '?'}`, value: shrine, how: '+ceil(5.55·L^0.385)% (already a fraction in the game)',
      pct: shrine == null ? null : Math.ceil(5.55 * Math.pow(shrine, 0.385)) },
    { name: 'Gorshank Y card', where: 'card 285 passive (CbonusChain)', value: card, how: '+card% − 1 (the game subtracts 1)', pct: card == null ? null : card - 1 },
    { name: potionName(104), where: `PotionLV[104], level ${pot ?? '?'}`, value: pot, how: '+5·L/(50+L)%', pct: pot == null ? null : (5 * pot) / (50 + pot) },
    { name: 'Chain level chance skill', where: `skill tree node 67 (Infinity), level ${skill ?? '?'}`, value: skill, how: '+(8·L+10)/(L+80)% (0.125% at L0)',
      pct: skill == null ? null : (8 * skill + 10) / (skill + 80) },
    { name: 'Lab tanks', where: 'TankBonusLIST[27]: tank parts 62/120/128/134 + pets 25/7/81, × Toothpaste Tube', value: tank, how: '+(T − 1)%',
      pct: tank == null ? null : tank - 1 },
    { name: masteryPerkName(66), where: 'mastery capstone 66 (unlocked count)', value: mast, how: '+3·U%', pct: mast == null ? null : 3 * mast },
    { name: 'Sahaja (Realm shrine)', where: `Realm shrine 6, level ${sahaja ?? '?'}`, value: sahaja, how: '+L%', pct: sahaja },
    { name: 'Jawbreaker', where: `Realm vending item 15, level ${jaw ?? '?'}`, value: jaw, how: '+round(50·L/(L+35), 1)%',
      pct: jaw == null ? null : vendingBonus(15, jaw) },
  ]
}


/** Away gain % sum (@20193413): Σ uncapped pct + min(Σ capped pct, 90). */
export function awayTotal(rows: { pct: number; cap?: boolean }[]) {
  const free = rows.filter((r) => !r.cap).reduce((a, r) => a + r.pct, 0), capped = rows.filter((r) => r.cap).reduce((a, r) => a + r.pct, 0)
  return { capped, value: free + Math.min(capped, 90) }
}

const awayRows = (s: Save): Row[] => {
  const asc = at(s, 'TimesAscended'), card = s.CardLevels == null ? null : n(cbonus(s, catalog as unknown as Catalog).CbonusAwayScreenProgress)
  const shrine = at(s, 'ShrineLevels', 9), perk = at(s, 'MasteryPerksUnlocked', 125), rs = s.RealmStuff as unknown[] | undefined
  const pre = asc != null && asc < 1, realm = rs == null ? null : rs.length > 0 && !pre // the Realm terms need an ascension and RealmStuff
  const off = (r: Row, why: string): Row => ({ ...r, how: why, pct: r.value == null ? null : 0 })
  const lv = at(s, 'RealmStuff', 0), nirvana = at(s, 'RealmStuff', 13, 7), corn = at(s, 'RealmStuff', 8, 9)
  const realmRows: Row[] = [
    { name: 'Away-gains fruit (type 16)', where: 'Realm Cornucopia fruit slots RealmStuff[17]', value: rs == null ? null : fruitBonus(s, 16),
      how: '+Σ rolled % × (1 + Juiced Fruit/100) × (1 + fruit 18/100)', pct: rs == null ? null : fruitBonus(s, 16) },
    { name: 'Corn Can', where: `Realm vending item 9, level ${corn ?? '?'}`, value: corn, how: '+2·L%', pct: corn == null ? null : vendingBonus(9, corn) },
    { name: 'Nirvana (Realm shrine)', where: `Realm shrine 7 level ${nirvana ?? '?'}, Realm Lv ${lv ?? '?'}`, value: nirvana, how: '+L·⌊Realm Lv/10⌋%',
      pct: nirvana == null || lv == null ? null : nirvana * Math.floor(lv / 10) },
  ]
  return [
    { name: 'Base', where: `TimesAscended ${asc ?? '?'}`, value: asc, how: '100% before the first ascension, 28% after', pct: asc == null ? null : pre ? 100 : 28 },
    { name: 'Cards', where: 'selected card deck at load (CbonusAwayScreenProgress)', value: card, how: '+card%', pct: card },
    { name: 'Best Rest shrine', where: `Asylum shrine 9, level ${shrine ?? '?'}`, value: shrine, how: pre ? '+L/2%' : '+L/2%, in the 90% cap',
      pct: shrine == null ? null : 0.5 * shrine, cap: !pre },
    pre ? off({ name: masteryPerkName(125), where: 'mastery capstone 125', value: perk, how: '', pct: 0 }, 'only read after an ascension')
      : { name: masteryPerkName(125), where: 'mastery capstone 125 (unlocked count)', value: perk, how: '+5·U%, in the 90% cap', pct: perk == null ? null : 5 * perk, cap: true },
    ...(realm === true ? realmRows : realmRows.map((r) => off(r, realm == null ? 'unknown: no RealmStuff in this save' : 'only read once the Realm exists'))
      .map((r) => (realm == null ? { ...r, pct: null } : r))),
  ]
}

/** Fight damage per hit (GetPlayerDPS @2637594, combat.ts): (B·Πx)^(2/(max(IceCream, 1) + 1)), B = 25·STR + 8·ATK + 2·END + SmithingBaseAttack. */
export function damageTotal(base: number, factors: number[], iceCream: number) {
  const mult = factors.reduce((a, x) => a * x, 1), exp = 2 / (Math.max(iceCream, 1) + 1)
  return { mult, exp, dps: Math.pow(base * mult, exp) }
}

const damageRows = (s: Save): Row[] => {
  const f = fightStats(s)
  if ('missing' in f) return [{ name: 'Fight stats', where: `the save lacks ${f.missing}`, value: null, how: '', x: null }]
  const rd = f.rd, C = cbonus(rd, catalog as unknown as Catalog, LINK), E = equipmentBonuses(rd).scalar, a = (k: string, i: number) => at(rd, k, i)
  const str = n(rd.strLVL), atk = n(rd.atkLVL), water = n(rd.waterLV), rs = rd.RealmStuff as any[] | undefined
  const g = (v: number | null, fn: (v: number) => number) => (v == null ? null : fn(v))
  let aa14 = 0
  for (let i = 1; i <= 8; i++) aa14 += n(a('CultLuckLV', i)) + n(a('AcolyteLV3', i))
  const r1 = a('RiftLVL', 3), c44 = a('ConstructLV', 44), vend = at(rd, 'RealmStuff', 8, 1), resets = at(rd, 'RealmStuff', 23)
  const tp = [a('TrainingPerkLevels', 1), a('TrainingPerkLevels', 7), a('TrainingPerkLevels', 14)]
  const row = (name: string, where: string, value: number | null, how: string, x: number | null): Row => ({ name, where, value, how, x })
  return [
    { name: 'Base attack', where: '25·STR + 8·ATK + 2·END + SmithingBaseAttack (fight-scene copy)', value: 25 * str + 8 * atk + 2 * n(rd.endLVL) + f.SmithingBaseAttack, how: 'B, the base everything multiplies' },
    row('Medallion boost', 'smithing medallion items (fight-scene copy, @31690067)', f.MedallionDamageBoost, '×M', f.MedallionDamageBoost),
    row('STR scaling', `STR level ${str}`, str, '×(STR + 10)/10', (str + 10) / 10),
    row('ATK scaling', `ATK level ${atk}`, atk, '×(ATK + 25)/25', (atk + 25) / 25),
    row(`${ascName(5)} × Water`, `AscentionLevel[5], Water level ${water}`, a('AscentionLevel', 5), '×(1 + 0.005·Water·L)', g(a('AscentionLevel', 5), (L) => 1 + 0.005 * water * L)),
    row('Event damage', 'EventBonusDamage', at(rd, 'EventBonusDamage'), '×(1 + v/100)', g(at(rd, 'EventBonusDamage'), (v) => 1 + v / 100)),
    row(`${RIFTS[3]} rift`, 'RiftLVL[3]', r1, '×(1 + ⌊15·min(L,1) + 5·L⌋/100)', g(r1, (L) => 1 + Math.floor(15 * Math.min(L, 1) + 5 * L) / 100)),
    row('Merits + contracts', 'skills 38 (per 10 merits spent), 39 (per contract)', a('SkillLevels', 38),
      '×(1 + ⌊merits/10⌋·⌊S38⌋/100 + 0.5·S39·contracts/100)', 1 + Math.floor(n(rd.MeritsSpent) / 10) * Math.floor(n(a('SkillLevels', 38))) / 100 + 0.5 * n(a('SkillLevels', 39)) * n(rd.ContractsCompleted) / 100),
    row('Cards (Fighting deck)', 'CbonusTotalDamage', n(C.CbonusTotalDamage), '×(1 + c/100)', 1 + n(C.CbonusTotalDamage) / 100),
    row('Equipment (Fighting tinker deck)', 'EbonusTotalDmgPCT', n(E.EbonusTotalDmgPCT), '×(1 + e/100)', 1 + n(E.EbonusTotalDmgPCT) / 100),
    row('Mastery perks', 'MasteryBonuses[1]', masteryBonuses(rd)[1]!, '×M', masteryBonuses(rd)[1]!),
    row('Civilization', 'CivType', at(rd, 'CivType'), '×(1 + v/2)', g(at(rd, 'CivType'), (v) => 1 + v / 2)),
    row(`${ascName(44)} × Water`, 'AscentionLevel[44]', a('AscentionLevel', 44), '×(1 + L·max(Water − 100, 0)/100)', g(a('AscentionLevel', 44), (L) => 1 + L * Math.max(water - 100, 0) / 100)),
    row('Potions', 'PbonusDamageSUM (load-time, stored)', at(rd, 'PbonusDamageSUM'), '×(1 + p/100)', g(at(rd, 'PbonusDamageSUM'), (v) => 1 + v / 100)),
    row(`${building(6)} × cult/acolyte levels`, `ConstructLV[6], Σ CultLuckLV + AcolyteLV3 = ${aa14}`, a('ConstructLV', 6), '×(1 + 10·L·Σ/100)', g(a('ConstructLV', 6), (L) => 1 + 10 * L * aa14 / 100)),
    row('Bhakti (Realm shrine)', 'RealmStuff[13][1]', at(rd, 'RealmStuff', 13, 1), '×1.08^L', rs == null ? null : Math.pow(1.08, Math.max(0, n(rs[13]?.[1])))),
    row('Fight-damage fruit (type 15)', 'Realm Cornucopia fruit slots', rs == null ? null : fruitBonus(rd, 15), '×(1 + fruit/100)', rs == null ? null : 1 + fruitBonus(rd, 15) / 100),
    row('Burrito per Realm reset', `vending 1 level ${vend ?? '?'}, RealmStuff[23] = ${resets ?? '?'}`, vend, '×(1 + v/100)^resets',
      vend == null || resets == null ? null : Math.pow(1 + vendingBonus(1, vend) / 100, resets)),
    row(`${building(44)} × Water above 1000`, 'ConstructLV[44]', c44, '×(1 + 100·L^1.10128·1.02^L·max(Water − 1000, 0)/100)',
      g(c44, (L) => 1 + 100 * Math.pow(L, 1.10128) * Math.pow(1.02, L) * Math.max(water - 1e3, 0) / 100)),
    row(ascName(49), 'AscentionLevel[49]', a('AscentionLevel', 49), '×(1 + 5·L/100)', g(a('AscentionLevel', 49), (L) => 1 + 5 * L / 100)),
    row(ascName(40), 'AscentionLevel[40]', a('AscentionLevel', 40), '×(1 + 10·L/100)', g(a('AscentionLevel', 40), (L) => 1 + 10 * L / 100)),
    row(ascName(62), 'AscentionLevel[62]', a('AscentionLevel', 62), '×(1 + 15·L/100)', g(a('AscentionLevel', 62), (L) => 1 + 15 * L / 100)),
    row('Crit toggles', 'CritToggles (each also costs 20% crit chance)', at(rd, 'CritToggles'), '×1.1^T', g(at(rd, 'CritToggles'), (T) => Math.pow(1.1, T))),
    row('Wrath shrine', `Asylum shrine 1, STR above 50 = ${Math.max(str - 50, 0)}`, a('ShrineLevels', 1), '×(1 + L·max(STR − 50, 0)/100)', g(a('ShrineLevels', 1), (L) => 1 + L * Math.max(str - 50, 0) / 100)),
    row('Arcade upgrade: Damage', 'EventUpgradeLevels[1]', a('EventUpgradeLevels', 1), '×(1 + 3·L/100)', g(a('EventUpgradeLevels', 1), (L) => 1 + 3 * L / 100)),
    row('The Power shrine', 'Asylum shrine 10', a('ShrineLevels', 10), '×(1 + 10·L/100)', g(a('ShrineLevels', 10), (L) => 1 + 10 * L / 100)),
    row('Lab tank 8', 'TankBonusLIST[8] (load-time, stored)', a('TankBonusLIST', 8), '×T', a('TankBonusLIST', 8)),
    row(`Skill tree: ${skillName(61)}`, 'SkillLevels[61]', a('SkillLevels', 61), '×(1 + 2·L/100)', g(a('SkillLevels', 61), (L) => 1 + 2 * L / 100)),
    row('Training perks 1 / 7 / 14', `levels ${tp.map((v) => v ?? '?').join(' / ')}`, tp[2] ?? null, '×(1 + (5·P1 + 20·P7 + 50·P14)/100)',
      tp.some((v) => v == null) ? null : 1 + (5 * tp[0]! + 20 * tp[1]! + 50 * tp[2]!) / 100),
  ]
}

/** SmithingBonusCash as the fight scene's init writes it (@31683161): (1 + Σ additive)·Πx, then × A^((0.96·i92/(i92 + 2200))²)
 *  when smith item 92 is owned (@31693916), A = the additive sum's smithing part. Cash per kill (defaultgold) is linear in it. */
export function cashTotal(pcts: number[], factors: number[]) {
  return (1 + pcts.reduce((a, p) => a + p, 0) / 100) * factors.reduce((a, x) => a * x, 1)
}

const cashRows = (s: Save): Row[] => {
  const rd = raidDecks(s, LINK), a = (k: string, i: number) => at(rd, k, i), si = (i: number) => n(a('SmithingItemLevel', i))
  const g = (v: number | null, fn: (v: number) => number) => (v == null ? null : fn(v))
  const water = n(rd.waterLV), sm = rd.SmithingItemLevel == null ? null : smithCash(rd)
  const C = cbonus(rd, catalog as unknown as Catalog, LINK), E = equipmentBonuses(rd).scalar, asc15 = a('AscentionLevel', 15), zc = zoneTotalCardLV(rd)[2]!
  const c44 = a('ConstructLV', 44), vend = at(rd, 'RealmStuff', 8, 4), resets = at(rd, 'RealmStuff', 23), rs = rd.RealmStuff
  const p1 = a('RiftProLvs', 1), rift = a('RiftLVL', 1), eu3 = a('EventUpgradeLevels', 3), heavy = a('ShrineLevels', 5), tog = at(rd, 'HeavyCashToggle')
  const i92 = si(92)
  return [
    { name: [4, 12, 44, 68, 84].map(smithName).join(', '), where: 'SmithingItemLevel[4/12/44/68/84] (84 also × Spelunking LV/2 × 2.39^min(L84/1000, 15))', value: sm, how: '+100·(0.02·L4 + 0.03·L12 + 0.1·L44 + 0.4·L68 + …)%',
      pct: sm == null ? null : 100 * sm },
    { name: smithName(28), where: 'SmithingItemLevel[28]', value: si(28), how: '+6·L%', pct: rd.SmithingItemLevel == null ? null : 6 * si(28) },
    { name: 'Event cash', where: 'EventCashBonus', value: at(rd, 'EventCashBonus'), how: '+v%', pct: at(rd, 'EventCashBonus') },
    { name: `${ascName(15)} × zone 2 cards`, where: `AscentionLevel[15], ZoneTotalCardLV[2] = ${zc}`, value: asc15, how: '+0.2·L·cardLV%', pct: g(asc15, (L) => 0.2 * L * zc) },
    { name: 'Equipment (Fighting tinker deck)', where: 'EbonusMonsterGold', value: n(E.EbonusMonsterGold), how: '×(1 + e/100)', x: 1 + n(E.EbonusMonsterGold) / 100 },
    { name: `${building(44)} × Water above 1000`, where: 'ConstructLV[44]', value: c44, how: '×(1 + 100·L^1.10128·1.02^L·max(Water − 1000, 0)/100)',
      x: g(c44, (L) => 1 + 100 * Math.pow(L, 1.10128) * Math.pow(1.02, L) * Math.max(water - 1e3, 0) / 100) },
    { name: 'White Choc Dollar per Realm reset', where: `vending 4 level ${vend ?? '?'}, RealmStuff[23] = ${resets ?? '?'}`, value: vend, how: '×(1 + v/100)^resets',
      x: vend == null || resets == null ? null : Math.pow(1 + vendingBonus(4, vend) / 100, resets) },
    { name: 'Cash fruit (type 11)', where: 'Realm Cornucopia fruit slots', value: rs == null ? null : fruitBonus(rd, 11), how: '×(1 + fruit/100)', x: rs == null ? null : 1 + fruitBonus(rd, 11) / 100 },
    { name: 'Potions', where: 'PbonusCashSUM (load-time, stored)', value: at(rd, 'PbonusCashSUM'), how: '×(1 + p/100)', x: g(at(rd, 'PbonusCashSUM'), (v) => 1 + v / 100) },
    { name: 'Cards (Fighting deck)', where: 'CbonusMonsterCash', value: n(C.CbonusMonsterCash), how: '×(1 + c/100)', x: 1 + n(C.CbonusMonsterCash) / 100 },
    { name: 'Mastery perks', where: 'MasteryBonuses[2]', value: masteryBonuses(rd)[2]!, how: '×M', x: masteryBonuses(rd)[2]! },
    { name: 'Lab tank 3', where: 'TankBonusLIST[3] (load-time, stored)', value: a('TankBonusLIST', 3), how: '×T', x: a('TankBonusLIST', 3) },
    { name: 'Training perk 3', where: 'TrainingPerkLevels[3]', value: a('TrainingPerkLevels', 3), how: '×(1 + 15·L/100)', x: g(a('TrainingPerkLevels', 3), (L) => 1 + 15 * L / 100) },
    { name: `${ascName(39)} × Water`, where: 'AscentionLevel[39]', value: a('AscentionLevel', 39), how: '×(1 + L·max(Water − 100, 0)/100)', x: g(a('AscentionLevel', 39), (L) => 1 + L * Math.max(water - 100, 0) / 100) },
    { name: 'Arcade upgrade: Cash', where: 'EventUpgradeLevels[3]', value: eu3, how: '×(1 + 5·L/100)', x: g(eu3, (L) => 1 + 5 * L / 100) },
    { name: `${RIFTS[1]} Pro rift per 10 ${RIFTS[1]} rift levels`, where: `RiftProLvs[1], RiftLVL[1] = ${rift ?? '?'}`, value: p1, how: '×(1 + P/(P + 100))^⌊Rift/10⌋',
      x: p1 == null || rift == null ? null : Math.pow(1 + 2 * p1 / (p1 + 100) * 0.5, Math.floor(rift / 10)) },
    { name: 'Heavy Cash shrine (toggle)', where: `Asylum shrine 5, HeavyCashToggle ${tog ?? '?'}`, value: heavy, how: '×max((1.25 + L/200)^toggle, 1)',
      x: heavy == null || tog == null ? null : Math.max(Math.pow(1.25 + heavy / 200, tog), 1) },
    { name: smithName(92), where: `SmithingItemLevel[92] = ${i92}`, value: i92, how: '×(smith sum + 0.06·L28)^((0.96·L92/(L92 + 2200))²) when L92 > 0',
      x: sm == null ? null : i92 > 0 ? Math.pow(1 + sm + 0.06 * si(28), Math.pow(0.96 * i92 / (i92 + 2200), 2)) : 1 },
  ]
}
/** The smithing part of the cash sum, minus its leading 1 (@31678200): 0.02·L4 + 0.03·L12 + 0.1·L44 + 0.4·L68 + L84·(SpelunkerLV/2)·2.39^min(L84/1000, 15). */
function smithCash(s: Save) {
  const si = (i: number) => n(at(s, 'SmithingItemLevel', i))
  return 0.02 * si(4) + 0.03 * si(12) + 0.1 * si(44) + 0.4 * si(68) + si(84) * (n(s.SpelunkerLV) / 10 * 5) * Math.pow(2.39, Math.min(si(84) / 1e3, 15))
}

/** Π of the x rows (null when one is unknown). */
const prod = (rows: Row[]) => rows.reduce<number | null>((a, r) => (a == null || r.x === null ? null : r.x === undefined ? a : a * r.x), 1)
const gx = (v: number | null, fn: (v: number) => number) => (v == null ? null : fn(v))
const stored = (s: Save, k: string) => (s[k] == null ? null : n(s[k]))

/** Crit chance (fight-scene init, YourCritChance @31674529): max(10 + 0.25·S24 + 0.75·S56 + cards + equipment − 20·toggles, 0).
 *  A hit crits when randomInt(1, 100) ≤ chance (@2956650), so above 100% the on-screen excess is wasted. */
export const critChanceTotal = (pcts: number[]) => Math.max(pcts.reduce((a, p) => a + p, 0), 0)
const critChanceRows = (s: Save): Row[] => {
  const rd = raidDecks(s, LINK), si = at(rd, 'SmithingItemLevel', 24), s56 = at(rd, 'SmithingItemLevel', 56), tog = at(rd, 'CritToggles')
  const C = n(cbonus(rd, catalog as unknown as Catalog, LINK).CbonusCriticalChance), E = n(equipmentBonuses(rd).scalar.EbonusCritChance)
  return [
    { name: 'Base', where: '@31674529', value: 10, how: '+10%', pct: 10 },
    { name: smithName(24), where: `SmithingItemLevel[24] @31673821`, value: si, how: '+0.25·L%', pct: gx(si, (L) => 0.25 * L) },
    { name: smithName(56), where: `SmithingItemLevel[56] @31674072`, value: s56, how: '+0.75·L%', pct: gx(s56, (L) => 0.75 * L) },
    { name: 'Cards (Fighting deck)', where: 'CbonusCriticalChance @31674348', value: C, how: '+c%', pct: C },
    { name: 'Equipment (Fighting tinker deck)', where: 'EbonusCritChance @31674399', value: E, how: '+e%', pct: E },
    { name: 'Crit toggles', where: 'CritToggles @31674448 (each also gives ×1.1 damage)', value: tog, how: '−20·T%', pct: gx(tog, (T) => -20 * T) },
  ]
}

/** Crit damage (YourCriticalDamage @31677010): (1.25 + Σ additive/100)·(1 + equipment/100)·MasteryBonuses[3]·(1 + PbonusCritDmg/100). */
const critDmgRows = (s: Save): Row[] => {
  const rd = raidDecks(s, LINK), s8 = at(rd, 'SmithingItemLevel', 8), s40 = at(rd, 'SmithingItemLevel', 40), ev = stored(rd, 'EventCritDmgBonus') ?? 0
  const C = n(cbonus(rd, catalog as unknown as Catalog, LINK).CbonusCriticalDamage), E = n(equipmentBonuses(rd).scalar.EbonusCritDMG)
  const a23 = at(rd, 'AscentionLevel', 23), z4 = zoneTotalCardLV(rd)[4]!
  return [
    { name: 'Base', where: '@31677010', value: 125, how: '125%', pct: 125 },
    { name: smithName(8), where: 'SmithingItemLevel[8] @31675473', value: s8, how: '+0.75·L%', pct: gx(s8, (L) => 0.75 * L) },
    { name: smithName(40), where: 'SmithingItemLevel[40] @31675723', value: s40, how: '+2.5·L%', pct: gx(s40, (L) => 2.5 * L) },
    { name: 'Event crit damage', where: 'EventCritDmgBonus @31675974', value: ev, how: '+v%', pct: ev },
    { name: 'Cards (Fighting deck)', where: 'CbonusCriticalDamage @31676024', value: C, how: '+c%', pct: C },
    { name: `${ascName(23)} × zone 4 cards`, where: `AscentionLevel[23] @31676077, ZoneTotalCardLV[4] = ${z4}`, value: a23, how: '+0.1·L·cardLV%', pct: gx(a23, (L) => 0.1 * L * z4) },
    { name: 'Equipment (Fighting tinker deck)', where: 'EbonusCritDMG @31676575', value: E, how: '×(1 + e/100)', x: 1 + E / 100 },
    { name: 'Mastery perks', where: 'MasteryBonuses[3] @31676625', value: masteryBonuses(rd)[3]!, how: '×M', x: masteryBonuses(rd)[3]! },
    { name: 'Potions', where: 'PbonusCritDmg @31676925 (load-time, stored)', value: stored(rd, 'PbonusCritDmg'), how: '×(1 + p/100)', x: gx(stored(rd, 'PbonusCritDmg'), (v) => 1 + v / 100) },
  ]
}

/** Pachinko potion factor shared by brewing and ores: A^(1 + min(1.25·P167/(P167 + 175), 1)), A = 1 + 40·P156/(P156 + 175)·g·(tickets/50)/100. */
const pachi = (s: Save, gate: number) => {
  const P = (i: number) => n(at(s, 'PotionLV', i)), A = 1 + 40 * P(156) / (P(156) + 175) * gate * (n(s.PachiTixCollected) / 50) / 100
  return Math.pow(A, 1 + Math.min(1.25 * P(167) / (P(167) + 175), 1))
}

/** Ore gains (Mining scene init, BonusOresCUMULATIVEpercent @30259194): 100·(Π factors − 1), on the Mining-linked decks (6). */
const oreRows = (s: Save): Row[] => {
  const rd = raidDecks(s, 6), a = (k: string, i: number) => at(rd, k, i), P = (i: number) => n(a('PotionLV', i)), water = n(rd.waterLV)
  const C = n(cbonus(rd, catalog as unknown as Catalog, 6).CbonusMiningOres), E = n(equipmentBonuses(rd).scalar.EbonusOreMined)
  const fm = n(rd.FarthestMonster), g168 = Math.min(P(168), 1), s93 = n(a('SmithingItemLevel', 93)), c46 = a('ConstructLV', 46), c4 = a('ConstructLV', 4)
  const sh = a('ShrineLevels', 4), tp = a('TrainingPerkLevels', 4), a38 = a('AscentionLevel', 38), a16 = a('AscentionLevel', 16), pot = stored(rd, 'PbonusOresGiven')
  return [
    { name: 'Scavenge shrine', where: 'Asylum shrine 4 @30252920', value: sh, how: '×(1 + 5·L/100)', x: gx(sh, (L) => 1 + 5 * L / 100) },
    { name: 'Cards (Mining deck)', where: 'CbonusMiningOres @30253148', value: C, how: '×(1 + c/100)', x: 1 + C / 100 },
    { name: 'Training perk 4', where: 'TrainingPerkLevels[4] @30253200', value: tp, how: '×(1 + 8·L/100)', x: gx(tp, (L) => 1 + 8 * L / 100) },
    { name: ascName(38), where: 'AscentionLevel[38] @30253441', value: a38, how: '×(1 + 10·L/100)', x: gx(a38, (L) => 1 + 10 * L / 100) },
    { name: 'Equipment (Mining tinker deck)', where: 'EbonusOreMined @30253681', value: E, how: '×(1 + e/100)', x: 1 + E / 100 },
    { name: `${ascName(16)} × Copper owned`, where: `AscentionLevel[16] @30253731, OresOwned[1] = ${sig(n(a('OresOwned', 1)))}`, value: a16, how: '×(1 + 0.5·L/100·0.43·ln(ores + 1))',
      x: gx(a16, (L) => 1 + 0.5 * L / 100 * 0.43 * Math.log(Math.abs(n(a('OresOwned', 1))) + 1)) },
    { name: 'Potions', where: 'PbonusOresGiven @30254267 (load-time, stored)', value: pot, how: '×(1 + p/100)', x: gx(pot, (v) => 1 + v / 100) },
    { name: `${potionName(156)} / ${potionName(167)}`, where: `PotionLV[156] = ${P(156)}, [167] = ${P(167)}, tickets ${n(rd.PachiTixCollected)} @30254335`, value: P(156), how: 'A^(1 + min(1.25·P167/(P167+175), 1))', x: pachi(rd, 1) },
    { name: `${potionName(132)} per monster reached`, where: `PotionLV[132] @30255611, [168] @30255361, FarthestMonster ${fm}`, value: P(132),
      how: '×(1 + 0.45·P132/(P132+175)·min(P168,1))^⌈FM^0.6 + max((FM−195)/5, 0)·min(P168,1)⌉',
      x: Math.pow(1 + 0.45 * P(132) / (P(132) + 175) * g168, Math.ceil(Math.pow(fm, 0.6) + Math.max((fm - 195) / 5, 0) * g168)) },
    { name: 'Lab tank 23', where: 'TankBonusLIST[23] @30256489 (load-time, stored)', value: a('TankBonusLIST', 23), how: '×T', x: a('TankBonusLIST', 23) },
    { name: `${smithName(93)} per Cool Cash star`, where: `SmithingItemLevel[93] @30256722, CoolCashStars ${n(rd.CoolCashStars)}`, value: s93,
      how: '×(1 + 3·L/(L+1500)·1.085^min(L/1000, 15))^stars', x: Math.pow(1 + 3 * s93 / (s93 + 1500) * Math.pow(1.085, Math.min(s93 / 1e3, 15)), n(rd.CoolCashStars)) },
    { name: `${building(46)} × Water above 1000`, where: 'ConstructLV[46] @30257528', value: c46, how: '×(1 + 100·L^1.10128·1.02^L·max(Water − 1000, 0)/100)',
      x: gx(c46, (L) => 1 + 100 * Math.pow(L, 1.10128) * Math.pow(1.02, L) * Math.max(water - 1e3, 0) / 100) },
    { name: 'Mastery perks', where: 'MasteryBonuses[7] @30258102', value: masteryBonuses(rd)[7]!, how: '×M', x: masteryBonuses(rd)[7]! },
    { name: potionName(164), where: 'PotionLV[164] @30258335', value: P(164), how: '×(1 + min(1.2·L/(L+175), 1))', x: 1 + Math.min(1.2 * P(164) / (P(164) + 175), 1) },
    { name: `${building(4)} per 35 Mining levels`, where: `ConstructLV[4] @30258813, miningLVL ${n(rd.miningLVL)}`, value: c4, how: '×(1 + L/10)^(0.31·⌊miningLV/35⌋)',
      x: gx(c4, (L) => Math.pow(Math.pow(1 + L / 10, 0.31), Math.floor(n(rd.miningLVL) / 35))) },
  ]
}

/** Mining EXP (BonusMiningExpCUMUpercent @30260010): 100·(Π − 1), Mining-linked decks. */
const miningExpRows = (s: Save): Row[] => {
  const rd = raidDecks(s, 6), C = n(cbonus(rd, catalog as unknown as Catalog, 6).CbonusMiningExp), E = n(equipmentBonuses(rd).scalar.EbonusMiningEXP)
  const tp = at(rd, 'TrainingPerkLevels', 4), s69 = at(rd, 'SmithingItemLevel', 69), pot = stored(rd, 'PbonusMiningExp')
  return [
    { name: 'Cards (Mining deck)', where: 'CbonusMiningExp @30259303', value: C, how: '×(1 + c/100)', x: 1 + C / 100 },
    { name: 'Training perk 4', where: 'TrainingPerkLevels[4] @30259368', value: tp, how: '×(1 + 5·L/100)', x: gx(tp, (L) => 1 + 5 * L / 100) },
    { name: 'Equipment (Mining tinker deck)', where: 'EbonusMiningEXP @30259603', value: E, how: '×(1 + e/100)', x: 1 + E / 100 },
    { name: 'Potions', where: 'PbonusMiningExp @30259657 (load-time, stored)', value: pot, how: '×(1 + p/100)', x: gx(pot, (v) => 1 + v / 100) },
    { name: smithName(69), where: 'SmithingItemLevel[69] @30259717', value: s69, how: '×(1 + 5·L/100)', x: gx(s69, (L) => 1 + 5 * L / 100) },
  ]
}

/** Brew speed (PotionBrewSpeedBOOST[1], potions scene init @24876477): max(Π core, 1), then × potion 160 per flower owned past
 *  1.001e(21+i) (@24877721) and × the pachinko factor (@24879357). Cards: the Apothecary-linked deck (4). */
export const BREW_CORE = 10
const brewRows = (s: Save): Row[] => {
  const P = (i: number) => n(at(s, 'PotionLV', i)), sl = (i: number) => at(s, 'SkillLevels', i), tp6 = at(s, 'TrainingPerkLevels', 6), tp10 = at(s, 'TrainingPerkLevels', 10)
  const ps = potionBonuses(s).PotionSpeed, E = equipmentBonuses(s).three[14]!, C = n(cbonus(s, catalog as unknown as Catalog, 4).CbonusBrewSpeed), M = masteryBonuses(s)[18]!
  const a59 = at(s, 'AscentionLevel', 59), s56 = sl(56), s66 = sl(66), tank = s.TankLVs == null || s.PetCapsuleLV == null ? null : tankBonuses(s)[22]
  let flowers = 0
  for (let i = 0; i < 48; i++) if (n(at(s, 'flowersOwned', i + 1)) > 1.001 * Math.pow(10, 21 + i)) flowers++
  return [
    { name: 'Potions', where: 'PbonusPotionSpeed @24874687 (potion 24)', value: ps, how: '×(1 + p/100)', x: 1 + ps / 100 },
    { name: 'Equipment', where: 'EbonusThree[14] @24874740', value: E, how: '×(1 + e/100)', x: 1 + E / 100 },
    { name: 'Cards (Apothecary deck)', where: 'CbonusBrewSpeed @24874984', value: C, how: '×(1 + c/100)', x: 1 + C / 100 },
    { name: 'Mastery perks', where: 'MasteryBonuses[18] @24875036', value: M, how: '×M', x: M },
    { name: 'Training perks 6 / 10', where: `TrainingPerkLevels[6] @24875270, [10] @24875507`, value: tp6, how: '×(1 + (12·P6 + 25·P10)/100)',
      x: tp6 == null || tp10 == null ? null : 1 + (12 * tp6 + 25 * tp10) / 100 },
    { name: `Skill tree: ${skillName(56)}`, where: 'SkillLevels[56] @24875745', value: s56, how: '×(1 + 10·L/100)', x: gx(s56, (L) => 1 + 10 * L / 100) },
    { name: ascName(59), where: 'AscentionLevel[59] @24875976', value: a59, how: '×(1 + 8·L/100)', x: gx(a59, (L) => 1 + 8 * L / 100) },
    { name: 'Lab tank 22', where: 'TankBonusLIST[22] @24876212', value: tank, how: '×T', x: tank },
    { name: `Skill tree: ${skillName(66)} × Apothecary LV`, where: `SkillLevels[66] @24876459, ApothecaryLV ${n(s.ApothecaryLV)}`, value: s66, how: '×(1 + (0.4·L)^0.6·(ApothLV/3)/125)',
      x: gx(s66, (L) => 1 + Math.pow(0.4 * L, 0.6) * (n(s.ApothecaryLV) / 3) / 125) },
    { name: `${potionName(160)} per huge flower stack`, where: `PotionLV[160] @24877462, ${flowers} flower types past 1.001e(21+i) @24876876`, value: P(160),
      how: '×(1 + 0.85·L/(L+175))^count, after the max(…, 1)', x: Math.pow(1 + 0.85 * P(160) / (P(160) + 175), flowers) },
    { name: `${potionName(156)} / ${potionName(167)}`, where: `PotionLV[156] @24878284, [167] @24878770, tickets ${n(s.PachiTixCollected)}`, value: P(156),
      how: 'A^(1 + min(1.25·P167/(P167+175), 1)), A gated by min(P167, 1)', x: pachi(s, Math.min(P(167), 1)) },
  ]
}

/** Botany growth speed (HerbloreSpeedBOOST, Botany scene init @24240039): tier base × potions × equipment × cards × tank 11 × smith item 71 (its % capped at 60·100). */
const botanyRows = (s: Save): Row[] => {
  const base = tierPerks(s).speedBoost, fs = potionBonuses(s).FlowerSpeed, E = equipmentBonuses(s).three[1]!, C = n(cbonus(s, catalog as unknown as Catalog, 3).CbonusBotanySpeed)
  const tank = s.TankLVs == null || s.PetCapsuleLV == null ? null : tankBonuses(s)[11], s71 = at(s, 'SmithingItemLevel', 71)
  return [
    { name: 'Pot tier perks', where: 'pots at tier ≥ 8 (HerblorePotLevel) @24235301', value: (base - 1) / 0.3, how: '1 + 0.3 per pot', x: base },
    { name: 'Potions', where: 'PbonusFlowerSpeed @24239074', value: fs, how: '×(1 + p/100)', x: 1 + fs / 100 },
    { name: 'Equipment', where: 'EbonusThree[1] @24239128', value: E, how: '×(1 + e/100)', x: 1 + E / 100 },
    { name: 'Cards (Botany deck)', where: 'CbonusBotanySpeed @24239374', value: C, how: '×(1 + c/100)', x: 1 + C / 100 },
    { name: 'Lab tank 11', where: 'TankBonusLIST[11] @24239428', value: tank, how: '×T', x: tank },
    { name: smithName(71), where: 'SmithingItemLevel[71] @24239675', value: s71, how: '×(1 + min(round(10·L^0.91)/100, 60))',
      x: gx(s71, (L) => 1 + Math.min(Math.round(10 * Math.pow(L, 0.91)) / 100, 60)), cap: s71 != null && Math.round(10 * Math.pow(s71, 0.91)) / 100 > 60 },
  ]
}

/** AP per ascend multiplier (award handler @12472746..@12473636; ascendGain in ascend-rewards.ts): (1 + Σ additive/100)·Π. */
const apRows = (s: Save): Row[] => {
  const a = (k: string, i: number) => at(s, k, i), sec = n(a('SecretEarned', 2)), s59 = a('SmithingItemLevel', 59), s35 = a('SmithingItemLevel', 35)
  const r8 = a('RiftLVL', 8), sk37 = a('SkillLevels', 37), mtx = stored(s, 'MTXdoubleAP') ?? 0, bap = potionBonuses(s).BonusAP
  const cb = typeof s.CbonusAP === 'number' ? n(s.CbonusAP) : n(cbonus(s, catalog as unknown as Catalog).CbonusAP), a60 = a('AscentionLevel', 60), e4 = a('EventUpgradeLevels', 4)
  return [
    { name: smithName(59), where: 'SmithingItemLevel[59] @12470980', value: s59, how: '+2·L%', pct: gx(s59, (L) => 2 * L) },
    { name: 'Secret 2', where: 'SecretEarned[2] @12471231', value: sec, how: '+42·S%', pct: 42 * sec },
    { name: `${smithName(35)} × Secret 2`, where: 'SmithingItemLevel[35] @12471476', value: s35, how: '+2·L·S%', pct: gx(s35, (L) => 2 * L * sec) },
    { name: `${RIFTS[8]} rift + Skill tree: ${skillName(37)}`, where: `RiftLVL[8] @12471972, SkillLevels[37] @12472467`, value: r8, how: '×(1 + ⌊20·min(R,1) + 5·R + 4·S37⌋/100)',
      x: r8 == null || sk37 == null ? null : 1 + Math.floor(20 * Math.min(r8, 1) + 5 * r8 + 4 * sk37) / 100 },
    { name: 'Double AP pack', where: 'MTXdoubleAP @12472746', value: mtx, how: '×(1 + v)', x: 1 + mtx },
    { name: 'Potions', where: 'PbonusBonusAP @12472792 (potion 57)', value: bap, how: '×(1 + p/100)', x: 1 + bap / 100 },
    { name: ascName(60), where: 'AscentionLevel[60] @12472842', value: a60, how: '×(1 + 10·L/100)', x: gx(a60, (L) => 1 + 10 * L / 100) },
    { name: 'Arcade upgrade: Ascend', where: 'EventUpgradeLevels[4] @12473090', value: e4, how: '×(1 + 5·L/100)', x: gx(e4, (L) => 1 + 5 * L / 100) },
    { name: 'Cards', where: 'CbonusAP @12473343 (stored, else the selected deck)', value: cb, how: '×(1 + c/100)', x: 1 + cb / 100 },
    { name: 'Mastery perks', where: 'MasteryBonuses[31] @12473388', value: masteryBonuses(s)[31]!, how: '×M', x: masteryBonuses(s)[31]! },
    { name: 'Lab tank 19', where: 'TankBonusLIST[19] @12473636 (load-time, stored; not ported)', value: a('TankBonusLIST', 19), how: '×T', x: a('TankBonusLIST', 19) },
  ]
}

/** BP per rebirth multiplier (award handler @12482398..@12484665): every factor multiplies. */
const bpRows = (s: Save): Row[] => {
  const a = (k: string, i: number) => at(s, k, i), r8 = a('RiftLVL', 8), rp = a('RiftProLvs', 8), mtx = stored(s, 'MTXdoubleBP') ?? 0
  const cr = a('ContractRank', 50), a64 = a('AscentionLevel', 64), tp = a('TrainingPerkLevels', 11), s65 = a('SkillLevels', 65)
  return [
    { name: 'Double BP pack', where: 'MTXdoubleBP @12482398', value: mtx, how: '×(1 + v)', x: 1 + mtx },
    { name: `${RIFTS[8]} rift × its Pro level`, where: `RiftLVL[8] @12482442, RiftProLvs[8] @12482922`, value: r8, how: '×(1 + 250·R/(R+200)·2·P/(P+100)/100)',
      x: r8 == null || rp == null ? null : 1 + 250 * r8 / (r8 + 200) * (2 * rp / (rp + 100)) / 100 },
    { name: 'Contract rank 50', where: 'ContractRank[50] @12483408', value: cr, how: '×(1 + 3·L/100)', x: gx(cr, (L) => 1 + 3 * L / 100) },
    { name: ascName(64), where: 'AscentionLevel[64] @12483654', value: a64, how: '×(1 + ⌈L/100⌉)', x: gx(a64, (L) => 1 + Math.ceil(L / 100)) },
    { name: 'Training perk 11', where: 'TrainingPerkLevels[11] @12483921', value: tp, how: '×(1 + 2·L/100)', x: gx(tp, (L) => 1 + 2 * L / 100) },
    { name: 'Lab tank 32', where: 'TankBonusLIST[32] @12484173 (load-time, stored; not ported)', value: a('TankBonusLIST', 32), how: '×T', x: a('TankBonusLIST', 32) },
    { name: `Skill tree: ${skillName(65)}`, where: 'SkillLevels[65] @12484420', value: s65, how: '×(1 + 1.5·L/100)', x: gx(s65, (L) => 1 + 1.5 * L / 100) },
    { name: 'Mastery perks', where: 'MasteryBonuses[32] @12484665', value: masteryBonuses(s)[32]!, how: '×M', x: masteryBonuses(s)[32]! },
  ]
}

/** The x-only total, shown as ×v. */
const xTotal = (rows: Row[]): Total => {
  const v = prod(rows)
  return v == null ? UNKNOWN : { value: v, lines: [`Product of the factors = ×${sig(v)}.`] }
}
/** 100·(Π − 1)%, the game's "CUMU percent" form. */
const cumuTotal = (key: string) => (rows: Row[], s: Save): Total => {
  const v = prod(rows)
  if (v == null) return UNKNOWN
  return { value: v - 1, lines: [`100·(Π − 1) = +${sig(100 * (v - 1))}%.`, ...(s[key] != null ? [`The save stores ${key} ${sig(n(s[key]))}.`] : [])] }
}
const plusPct = (v: number) => `+${sig(100 * v)}%`

/** Card drop chances (#cards): the rolls cards-missing.ts expectedKills traces. Zones roll 1 in 170·(1 + mode/3)/(1 + C/100) per
 *  kill for modes 1-9 (@31781147 †) and 1500·(1 + (mode − 10)/2)/(1 + C/100) for 10-15 (@31812316 †), C = CbonusCardDropChance on
 *  the Fighting deck. Crusades roll per stage, ÷ min(Energy, 100)/100 ÷ (1 + (Card Drop + Crusade Card + gear card chance)/100)
 *  (@23368435 †, @23380524 †); crusade fights equip the Fighting deck too. */
const cardDropRows = (s: Save): Row[] => {
  const rd = raidDecks(s, LINK), C = n(cbonus(rd, catalog as unknown as Catalog, LINK).CbonusCardDropChance)
  return [{ name: 'Cards (Fighting deck)', where: 'CbonusCardDropChance @31781147', value: C, how: '÷(1 + c/100) on the roll', pct: C }]
}
const crusadeCardRows = (s: Save): Row[] => {
  const rd = raidDecks(s, LINK), cb = cbonus(rd, catalog as unknown as Catalog, LINK)
  const C = n(cb.CbonusCardDropChance), K = n(cb.CbonusCrusadeCardChance), E = n((s.EbonusCardChance as number | undefined) ?? equipmentBonuses(rd).scalar.EbonusCardChance)
  return [
    { name: 'Card Drop cards (Fighting deck)', where: 'CbonusCardDropChance @23368435', value: C, how: '+c%', pct: C },
    { name: 'Crusade Card cards (Fighting deck)', where: 'CbonusCrusadeCardChance @23368435', value: K, how: '+c%', pct: K },
    { name: 'Equipment card chance', where: 'EbonusCardChance (save, else equipped items)', value: E, how: '+e%', pct: E },
  ]
}
/** Spelunking card odds multiplier aa4 (bag listener @30207631 †): (1 + CbonusTunnels[9]/100)·(1 + 200·P152/(P152+175)/100)
 *  ·(1 + 200·P89/(P89+200)/100). The game sums the Spelunking deck's TunnelCardChance cards into CbonusTunnels[9] (@19158737 †). */
const spelunkCardRows = (s: Save): Row[] => {
  const rd = raidDecks(s, 12), T = n(cbonus(rd, catalog as unknown as Catalog, 12).CbonusTunnelCardChance), P = (i: number) => at(s, 'PotionLV', i)
  return [
    { name: 'Cards (Spelunking deck)', where: 'CbonusTunnels[9] @30206419', value: T, how: '×(1 + c/100)', x: 1 + T / 100 },
    { name: potionName(152), where: 'PotionLV[152] @30206666', value: P(152), how: '×(1 + 200·L/(L+175)/100)', x: gx(P(152), (L) => 1 + 2 * L / (L + 175)) },
    { name: potionName(89), where: 'PotionLV[89] @30207152', value: P(89), how: '×(1 + 200·L/(L+200)/100)', x: gx(P(89), (L) => 1 + 2 * L / (L + 200)) },
  ]
}
/** One bag item's card roll (@30207757 †, after the item's treasure): R = randomInt(1, ⌊350/(7 + t)/(m + 1e-4)⌋), a card when
 *  R < H^0.8 + 0.85 (@30208304 †). t = the item's treasure tier, m = the multiplier above, H = bag value/(1 + Value·Speed per
 *  hour), about the trip's hours. randomInt(1, 0) gives 0 or 1 (@592542 †). */
export function spelunkRoll(m: number, t: number, H: number) {
  const M = Math.floor(350 / (7 + t) / (m + 1e-4)), X = Math.pow(H, 0.8) + 0.85, lo = Math.min(1, M), hi = Math.max(1, M)
  return { M, p: Math.max(0, Math.min(hi, Math.ceil(X) - 1) - lo + 1) / (hi - lo + 1) }
}
/** Which card a won roll gives (@30208813 †): depth d starts at 1; up to 28 times it steps down one while randomInt(1, 1e6) <
 *  916297 and TreasureOwned[d + 1] > 1, else it stops at min(d, t) and gives card 540 + d + ⌊d/15⌋, but only if that card is
 *  unowned (CardLevels = 0, else nothing). After 28 steps, no card. out[d] = P(depth d). */
export function spelunkDepths(t: number, owned: (d: number) => number) {
  const q = 916296 / 1e6, out: number[] = []
  for (let d = 1, reach = 1; d <= 28; d++) {
    const step = owned(d + 1) > 1 ? q : 0, k = Math.min(d, t)
    out[k] = (out[k] ?? 0) + reach * (1 - step)
    reach *= step
  }
  return out
}
const spelunkCardId = (d: number) => 540 + d + Math.floor(d / 15)
function spelunkLines(s: Save, m: number) {
  return hired(s).map((k) => {
    const sp = spelunker(s, k), v = sp.bagAtTarget
    if (!(v >= 100)) return `Spelunker ${k}: target bag ${sig(v)} is under 100 (no bag).`
    const t = Math.floor(Math.min(Math.log10(v + 0.1) - 1, 26)), H = v / (1 + sp.value * sp.speed), r = spelunkRoll(m, t, H)
    const dist = spelunkDepths(t, (d) => n(at(s, 'TreasureOwned', d)))
    const next = dist.findIndex((p, d) => d > 0 && p > 0 && n(at(s, 'CardLevels', spelunkCardId(d))) === 0)
    let stop = 1
    while (stop < t && n(at(s, 'TreasureOwned', stop + 1)) > 1) stop++
    return `Spelunker ${k}, bag at target ${sig(v)} (tier ${t}, H ${sig(H)}): a roll wins per item ${r.p >= 1 ? 'always' : `1 in ${sig(1 / r.p)}`} (range 1-${r.M}); `
      + (next > 0 ? `next unowned card ${spelunkCardId(next)} (depth ${next}) ${sig(100 * r.p * dist[next]!)}% per item.`
        : `no unowned card reachable: the depth walk stops at ${stop} (TreasureOwned[${stop + 1}] ≤ 1).`)
  })
}
/** Raid loot, one roll per ticket spent (each raid boss's win handler: King @19927556 †, Entertainer @19940952 †, Sentinel
 *  @19956947 †, Demon @19971374 †). R = randomInt(1, 4000); the first rung R is under wins (C = CbonusRaidDrops):
 *  Candy Coupon 8·min(1 + C/100, 2.5) (King; others 5·min(1 + C/100, 3)) → Forge Coupon 150·(1 + C/100), only while the Infinity
 *  Forge is unbought (bought: R in that band falls to the next two rungs only) → Sparklecoin min(800, 80·CR43·(1 + C/200))
 *  → Raid ticket min(1428.57, 200·CR39·(1 + C/200)) (King outside the forge band: 133.33·CR39) → card pack R < 500 (King:
 *  max(1000, 133.33·CR39·(1 + C/200) + 500)) → actor 877 (not traced). CR = ContractRank (merit shop). Drop types: ActorEvents_894
 *  @15762865 †. Returns chances per ticket: [candy, forge, sparkle, ticket, pack, other]. */
export function raidLoot(C: number, r39: number, r43: number, forge: boolean, king: boolean) {
  const t1 = king ? 8 * Math.min(1 + C / 100, 2.5) : 5 * Math.min(1 + C / 100, 3), t2 = 150 * (1 + C / 100), t3 = Math.min(800, 80 * r43 * (1 + C / 200))
  const t4 = (k: number) => Math.min(1428.5714285714287, k * r39 * (1 + C / 200)), pack = king ? Math.max(1e3, 133.33333333333334 * r39 * (1 + C / 200) + 500) : 500
  const got = [0, 0, 0, 0, 0, 0]
  for (let R = 1; R <= 4000; R++) {
    if (R < t1) got[0]!++
    else if (R < t2 && !forge) got[1]!++
    else if (R < t2) { if (R < t3) got[2]!++; else if (R < t4(200)) got[3]!++ }
    else if (R < t3) got[2]!++
    else if (R < t4(king ? 133.33333333333334 : 200)) got[3]!++
    else if (R < pack) got[4]!++
    else got[5]!++
  }
  return got.map((c) => c / 4000)
}
export const RAID_LOOT = ['Candy Coupon', 'Forge Coupon', 'Sparklecoin', 'Raid ticket', 'Card pack', 'actor 877 (not traced)']
const raidLuckRows = (s: Save): Row[] => {
  const rd = raidDecks(s, 10), C = n(cbonus(rd, catalog as unknown as Catalog, 10).CbonusRaidDrops)
  return [
    { name: 'Cards (Boss Looting deck)', where: 'CbonusRaidDrops', value: C, how: '+c% on the ladder rungs (half on sparkle/ticket)', pct: C },
    { name: 'Merit shop CR39', where: 'ContractRank[39]: the raid-ticket and King card-pack rungs', value: at(s, 'ContractRank', 39), how: 'rung × CR39' },
    { name: 'Merit shop CR43', where: 'ContractRank[43]: the sparklecoin rung', value: at(s, 'ContractRank', 43), how: 'rung × CR43' },
    { name: 'Infinity Forge bought', where: 'InfinityForgePurchased: removes the Forge Coupon rung', value: s.InfinityForgePurchased ? 1 : 0, how: 'gate' },
  ]
}
/** A card roll randomInt(1, ⌊N/(1 + C/100)⌋) == 1: 1/M, or 50% once M = 0 (randomInt(1, 0) is 0 or 1, @592542 †). */
export function rollOdds(N: number, C: number) {
  const M = Math.floor(N / (1 + C / 100))
  return { M, p: M >= 1 ? 1 / M : 0.5 }
}
/** Highest fight mode with kills recorded (MapleMonster, as cards-missing.ts gates()). */
function furthestMode(s: Save) {
  for (let m = 15; m >= 1; m--) for (let L = 0; L < 100; L++) if (n(at(s, 'MapleMonster', 100 * (m < 10 ? m - 1 : m - 6) + L)) > 0) return m
  return 0
}
/** Highest crusade cleared at any difficulty (ConquestDifficultyLV[c] ≥ 1). */
function furthestCrusade(s: Save) {
  const d = (s.ConquestDifficultyLV as number[] | undefined) ?? []
  for (let c = d.length - 1; c >= 1; c--) if (n(d[c]) >= 1) return c
  return 0
}
/** Energy factor on crusade card rolls: min(Energy, 100)/100, Energy raised to ≥ 10 on entering the crusade scene (@23145007 †). */
export const crusadeEnergy = (s: Save) => Math.max(10, Math.min(n(s.Energy ?? 100), 100)) / 100
const pctSum = (rows: Row[]) => rows.reduce((a, r) => a + (r.pct ?? 0), 0)

/** The biggest single source: the row whose factor (x, or 1 + pct/100) is largest. */
export function biggest(rows: Row[]): Row | null {
  const w = (r: Row) => (r.x != null ? r.x : r.pct != null ? 1 + r.pct / 100 : null)
  return rows.reduce<Row | null>((b, r) => (w(r) != null && (b == null || w(r)! > w(b)!) ? r : b), null)
}
/** What a row adds, as the table shows it. */
export const adds = (r: Row) => r.x !== undefined ? (r.x == null ? 'unknown' : `×${sig(r.x)}`)
  : r.pct !== undefined ? (r.pct == null ? 'unknown' : `${r.pct >= 0 ? '+' : ''}${sig(r.pct)}%`) : 'base'
export const showTotal = (st: Stat, v: number | null) => (v == null ? 'unknown' : st.show ? st.show(v) : `${(100 * v).toFixed(2)}%`)

export const STATS: Stat[] = [{
  id: 'chain', label: 'Chain LV chance',
  rows: chainRows,
  total: (rows) => {
    if (unknown(rows)) return UNKNOWN
    const c = chainChance(rows.reduce((a, r) => a + r.pct!, 0))
    return { value: c.p, lines: [
      `Sum ${(100 * c.raw).toFixed(2)}%${c.raw > 0.85 ? ' → capped at 85%' : ''}: p = ${(100 * c.p).toFixed(2)}% per chain step.`,
      `P(≥ k free levels), k = 1..7: ${c.atLeast.map((x) => `${(100 * x).toFixed(1)}%`).join(', ')}.`,
      `Expected free levels per natural level-up: ${c.expected.toFixed(2)} (max 7).`,
    ], ...(c.raw > 0.85 ? { flag: `${(100 * c.raw).toFixed(2)}% vs 85% cap: ${(100 * (c.raw - 0.85)).toFixed(2)}% wasted` } : {}) }
  },
  meaning: 'Whenever a skill levels up naturally (LvUpChain = 1, @18665189), the game rolls R = 1..1000 once and checks 7 chain steps: step k gives a free level when 1000·p^k ≥ R. '
    + 'Each free level goes to a random skill: Strength 35%, Attack 25%, Endurance 20%, Water 15%, Fishing 5% (EventRNG 1..100, @18667900). The only chain-chance site in the game.',
}, {
  id: 'away', label: 'Away gains %',
  rows: awayRows,
  total: (rows, s) => {
    if (unknown(rows)) return UNKNOWN
    const t = awayTotal(rows as { pct: number; cap?: boolean }[])
    return { value: t.value / 100, lines: [
      ...(rows.some((r) => r.cap) ? [`Capped part (Best Rest shrine + mastery perk 125): ${sig(t.capped)}% → ${sig(Math.min(t.capped, 90))}%${t.capped > 90 ? ' (over the 90% cap, the rest is wasted)' : ` (${sig(90 - t.capped)}% below the cap)`}.`] : []),
      ...(s.nonActiveZoneGainPercent != null ? [`The save stores ${sig(n(s.nonActiveZoneGainPercent))}% (computed at its last load).`] : []),
    ], ...(t.capped > 90 ? { flag: `capped part ${sig(t.capped)}% vs 90% cap: ${sig(t.capped - 90)}% wasted` } : {}) }
  },
  meaning: 'nonActiveZoneGainPercent, computed once at game load (@20193413). Every screen you are not on progresses at this % of its active rate '
    + '(YouWereAwayForXseconds × %/100); the away panel divides by it to show the real time. Changing a source takes effect at the next load.',
}, {
  id: 'damage', label: 'Fight damage multiplier',
  rows: damageRows,
  total: (rows, s) => {
    if (unknown(rows) || at(s, 'IceCream') == null) return UNKNOWN
    const d = damageTotal(rows[0]!.value!, rows.slice(1).map((r) => r.x!), n(s.IceCream))
    return { value: d.mult, lines: [
      `Damage per hit = (B ${sig(rows[0]!.value!)} × ${sig(d.mult)})^${sig(d.exp)} = ${sig(d.dps)} (IceCream ${n(s.IceCream)}: exponent 2/(max(IceCream, 1) + 1)).`,
      ...(s.DPS != null ? [`The save stores DPS ${sig(n(s.DPS))} (the fight scene's last value).`] : []),
    ] }
  },
  show: (v) => `×${sig(v)}`,
  meaning: 'GetPlayerDPS (@2637594), the damage of one plain hit in the main fight scene, on the Fighting-linked card and tinker decks. '
    + 'Every factor multiplies. Skill 10 (×(1 + 0.2·skill 18) while cast) is left out, as on the Fighting tab. Raids and Asylum use the same block with their own decks.',
}, {
  id: 'cash', label: 'Monster cash multiplier',
  rows: cashRows,
  total: (rows, s) => {
    if (unknown(rows)) return UNKNOWN
    const v = cashTotal(rows.filter((r) => r.pct != null).map((r) => r.pct!), rows.filter((r) => r.x != null).map((r) => r.x!))
    return { value: v, lines: [
      `(1 + ${sig(rows.filter((r) => r.pct != null).reduce((a, r) => a + r.pct!, 0))}%) × the factors = ×${sig(v)}.`,
      ...(s.SmithingBonusCash != null ? [`The save stores SmithingBonusCash ${sig(n(s.SmithingBonusCash))} (written by whichever scene ran last, see below).`] : []),
    ] }
  },
  show: (v) => `×${sig(v)}`,
  meaning: 'SmithingBonusCash as the main fight scene writes it at entry (@31683161, then @31693916): cash per kill (defaultgold) is linear in it. '
    + 'The game has 8 copies of this formula (@3962213, @19887977, @19905156, @23160261, @23178321, @26873827, plus these two); the White Choc Dollar and cash-fruit '
    + 'terms appear only in this copy, and @3962213 / @23160261 leave out more, so the stored value drifts with the last scene you entered.',
}, {
  id: 'critchance', label: 'Crit chance',
  rows: critChanceRows,
  total: (rows, s) => {
    if (unknown(rows)) return UNKNOWN
    const v = critChanceTotal(rows.map((r) => r.pct!))
    return { value: v / 100, lines: [
      `max(Σ, 0) = ${sig(v)}%.`, ...(s.YourCritChance != null ? [`The save stores YourCritChance ${sig(n(s.YourCritChance))}% and CriticalChance ${sig(n(s.CriticalChance))}% (higher while crit buffs 4/14 are on, @19999892).`] : []),
    ], ...(v > 100 ? { flag: `${sig(v)}% vs 100%: ${sig(v - 100)}% wasted on screen` } : {}) }
  },
  meaning: 'YourCritChance, written by the fight scene init (@31674529) on the Fighting-linked decks and copied into CriticalChance. Each hit crits when '
    + 'randomInt(1, 100) ≤ chance (@2956650), so on screen anything above 100% does nothing; the AFK/away kill formulas (@31708372) use '
    + '(1 + chance/100·(crit damage − 1)) uncapped, so the excess still counts there.',
}, {
  id: 'critdmg', label: 'Crit damage',
  rows: critDmgRows,
  total: (rows, s) => {
    if (unknown(rows)) return UNKNOWN
    const add = rows.filter((r) => r.pct != null).reduce((a, r) => a + r.pct!, 0), v = add / 100 * prod(rows)!
    return { value: v, lines: [`${sig(add)}%/100 × the factors = ×${sig(v)}.`, ...(s.YourCriticalDamage != null ? [`The save stores YourCriticalDamage ${sig(n(s.YourCriticalDamage))}.`] : [])] }
  },
  show: (v) => `×${sig(v)}`,
  meaning: 'YourCriticalDamage, the fight scene init (@31677010) on the Fighting-linked decks: a crit hit does DPS × this.',
}, {
  id: 'carddrop', label: 'Card drop chance (zones)',
  rows: cardDropRows,
  total: (rows, s) => {
    const C = pctSum(rows), base = (m: number) => (m < 10 ? 170 * (1 + m / 3) : 1500 * (1 + (m - 10) / 2)), M = furthestMode(s)
    const one = (m: number) => { const r = rollOdds(base(m), C); return r.p >= 1 ? 'always' : `1 in ${sig(1 / r.p)}` }
    const r = M ? rollOdds(base(M), C) : null
    return { value: C / 100, lines: [`+${sig(C)}%: one card roll per kill is ${one(1)} on mode 1, ${one(9)} on mode 9, ${one(15)} on mode 15 (nothing from 16).`,
      `No cap: the roll is randomInt(1, ⌊N/(1 + C/100)⌋) == 1. It is certain once ⌊…⌋ = 1 (C > ${sig(100 * (base(1) / 2 - 1))}% on mode 1, ${sig(100 * (base(15) / 2 - 1))}% on mode 15); past C > 100·(N − 1)% ⌊…⌋ = 0 and randomInt(1, 0) is 0 or 1, so 50%.`,
      ...(M ? [`Furthest mode with kills: ${M}, ${one(M)}.`] : [])],
      ...(r && r.M < 1 ? { flag: `mode ${M}: card bonus past 100·(N − 1)%, roll back to 50%` } : r && r.M === 1 ? { flag: `mode ${M}: every kill drops a card (bonus at the 100% point)` } : {}) }
  },
  show: plusPct,
  meaning: 'CbonusCardDropChance on the Fighting-linked deck divides every zone kill\'s card roll (@31781147, @31812316). It is the only bonus on that roll. '
    + 'The wiki shows 180·(1 + m/3) for zones and 1800/2100/2400 for Purgatory/Bog/Lunar (modes 11-13); this bundle has 170 and 1500·(1 + (m − 10)/2) = 2250/3000/3750 (wiki likely an older version).',
}, {
  id: 'crusadecard', label: 'Crusade card chance',
  rows: crusadeCardRows,
  total: (rows, s) => {
    const sum = pctSum(rows), e = crusadeEnergy(s), c = furthestCrusade(s), k = e * (1 + sum / 100)
    const one = (N: number) => { const r = rollOdds(N / e, sum); return r.p >= 1 ? 'always' : `1 in ${sig(1 / r.p)}` }
    const stage = c ? rollOdds(250 * Math.ceil(c / 3) / e, sum) : null, boss = c ? rollOdds(500 * Math.ceil(c / 4) / e, sum) : null
    return { value: sum / 100, lines: [`+${sig(sum)}% (Card Drop + Crusade Card + gear) and Energy factor ${sig(e)}: each stage roll is ÷ ${sig(k)}.`,
      ...(c ? [`Furthest crusade cleared: ${c}. Stage rolls ${one(250 * Math.ceil(c / 3))}, boss roll ${one(500 * Math.ceil(c / 4))}.`] : []),
      'No cap on the bonus: certain once ⌊N/(e·(1 + C/100))⌋ = 1, back to 50% when it reaches 0 (randomInt(1, 0)).'],
      ...(e < 1 ? { flag: `Energy ${sig(100 * e)}% below 100% cuts card odds` } : stage && (stage.M < 1 || boss!.M < 1) ? { flag: `crusade ${c}: card bonus past the 100% point, roll back to 50%` } : {}) }
  },
  show: plusPct,
  meaning: 'Crusade stage and boss card rolls (@23368435, @23380524): ÷ min(Energy, 100)/100 ÷ (1 + total/100). Crusade fights use the Fighting-linked deck (crusadefight15). '
    + 'The crusade scene raises Energy to at least 10 on entry (@23145007) and takes 1 per fight reset (@23360797), so the factor is never below 0.1; zone fights floor it at 20 (@17987477), which is likely the wiki\'s "0% fight bonus" (×5).',
}, {
  id: 'spelunkcard', label: 'Spelunking card chance',
  rows: spelunkCardRows,
  total: (rows, s) => {
    const m = prod(rows)
    if (m == null) return UNKNOWN
    return { value: m, lines: [`Odds multiplier ×${sig(m)}: each bag item's roll range is ⌊350/(7 + tier)/×⌋.`, ...spelunkLines(s, m)] }
  },
  show: (v) => `×${sig(v)}`,
  meaning: 'Per bag item opened (bag listener @30207757): randomInt(1, ⌊350/(7 + tier)/m⌋) < H^0.8 + 0.85, H = bag value/(1 + Value·Speed) (≈ trip hours, @30208304). '
    + 'A win walks the treasure depth (@30208813) and gives card 540 + d + ⌊d/15⌋ only if unowned. m = TunnelCardChance cards × potions 152, 89 (@30207631).',
}, {
  id: 'raidluck', label: 'Raid drop luck',
  rows: raidLuckRows,
  total: (rows) => {
    const C = n(rows[0]!.value), r39 = n(rows[1]!.value), r43 = n(rows[2]!.value), forge = rows[3]!.value === 1
    const fmt = (p: number[]) => p.map((x, i) => `${RAID_LOOT[i]} ${sig(100 * x)}%`).filter((_, i) => i < 5).join(', ')
    const caps = [C > 150 ? 'King Candy Coupon rung capped at 2.5× (C > 150%)' : '', C > 200 ? 'other bosses\' Candy Coupon rung capped at 3× (C > 200%)' : '',
      80 * r43 * (1 + C / 200) >= 800 ? 'Sparklecoin rung at its 800 cap' : '', 200 * r39 * (1 + C / 200) >= 1428.5714285714287 ? 'Raid ticket rung at its 1428.57 cap' : ''].filter(Boolean)
    return { value: C / 100, lines: [`Per ticket spent, King: ${fmt(raidLoot(C, r39, r43, forge, true))}.`, `Entertainer/Sentinel/Demon: ${fmt(raidLoot(C, r39, r43, forge, false))}.`,
      `Without the bonus, King: ${fmt(raidLoot(0, r39, r43, forge, true))}.`, ...(caps.length ? [`Caps binding: ${caps.join('; ')}.`] : [])],
      ...(caps.length ? { flag: caps.join('; ') } : {}) }
  },
  show: plusPct,
  meaning: 'CbonusRaidDrops on the link-10 deck widens the raid loot ladder, one randomInt(1, 4000) per ticket (King @19927556, others @19940952, @19956947, @19971374): '
    + 'Candy Coupon ×min(1 + C/100, 2.5|3), Forge Coupon ×(1 + C/100), Sparklecoin and Raid ticket ×(1 + C/200) under caps 800 / 1428.57. Raid card rolls take no bonus; the Asylum ladder (asylum.ts) reads it too.',
}, {
  id: 'ores', label: 'Ore gains',
  rows: oreRows, total: cumuTotal('BonusOresCUMULATIVEpercent'), show: plusPct,
  meaning: 'BonusOresCUMULATIVEpercent, written by the Mining scene init (@30259194) after it equips the Mining-linked card and tinker decks (DeckLinkList = 6). '
    + 'Every mine gives ores × (1 + this/100). Sources computed at game load (potions, lab tank 23) are read as the save stores them.',
}, {
  id: 'miningexp', label: 'Mining EXP',
  rows: miningExpRows, total: cumuTotal('BonusMiningExpCUMUpercent'), show: plusPct,
  meaning: 'BonusMiningExpCUMUpercent, the Mining scene init (@30260010) on the Mining-linked decks. The Rift 5 term the miners add on top (gathering.ts) is not part of it.',
}, {
  id: 'brew', label: 'Brew speed',
  rows: brewRows,
  total: (rows, s) => {
    const core = prod(rows.slice(0, BREW_CORE)), post = prod(rows.slice(BREW_CORE))
    if (core == null || post == null) return UNKNOWN
    const v = Math.max(core, 1) * post
    return { value: v, lines: [`max(×${sig(core)}, 1) × ${sig(post)} = ×${sig(v)}.`,
      ...(Array.isArray(s.PotionBrewSpeedBOOST) ? [`The save stores PotionBrewSpeedBOOST[1] ${sig(n(s.PotionBrewSpeedBOOST[1]))}.`] : [])] }
  },
  show: (v) => `×${sig(v)}`,
  meaning: 'PotionBrewSpeedBOOST[1], written by the potions scene init (@24876477, again 50 ms later @24903889): every cauldron brews at this multiple.',
}, {
  id: 'botany', label: 'Botany growth speed',
  rows: botanyRows,
  total: (rows, s) => {
    const t = xTotal(rows)
    if (t.value == null) return t
    const r71 = rows.at(-1)!
    return { ...t, lines: [...t.lines, ...(s.HerbloreSpeedBOOST != null ? [`The save stores HerbloreSpeedBOOST ${sig(n(s.HerbloreSpeedBOOST))}.`] : [])],
      ...(r71.cap ? { flag: 'smith item 71 past its +6000% cap' } : {}) }
  },
  show: (v) => `×${sig(v)}`,
  meaning: 'HerbloreSpeedBOOST, the Botany scene init (@24240039): every pot grows at this multiple (botany-calc.ts botanyBoosts). Cards: the Botany-linked deck.',
}, {
  id: 'ap', label: 'AP per ascend multiplier',
  rows: apRows,
  total: (rows) => {
    if (unknown(rows)) return UNKNOWN
    const v = cashTotal(rows.filter((r) => r.pct != null).map((r) => r.pct!), rows.filter((r) => r.x != null).map((r) => r.x!))
    return { value: v, lines: [`(1 + ${sig(rows.filter((r) => r.pct != null).reduce((a, r) => a + r.pct!, 0))}%) × the factors = ×${sig(v)}.`] }
  },
  show: (v) => `×${sig(v)}`,
  meaning: 'What the ascend award (@12469725) multiplies APreward by (ascendGain in ascend-rewards.ts, checked against the game code). The Ascend tab shows the AP it gives.',
}, {
  id: 'bp', label: 'BP per rebirth multiplier',
  rows: bpRows, total: xTotal, show: (v) => `×${sig(v)}`,
  meaning: 'What the rebirth award (@12480775) multiplies BPreward by (ascendGain in ascend-rewards.ts, checked against the game code).',
}]
