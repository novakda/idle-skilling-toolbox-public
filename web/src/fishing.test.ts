import { expect, test } from 'bun:test'
import { awayFishing, chances, fishXp, fishing } from './fishing'

test('fish XP, tier odds and the stored last catch (the author 2026-10-04: LV 142, hook 6, rod 4)', () => {
  expect([1, 14, 15, 25, 30].map(fishXp)).toEqual([5, 70, 90, 290, 1005])
  const c = chances(6, 4, 142)
  expect(c.large).toBeCloseTo(24.3, 6) // stored FishChanceLARGE
  expect(c.medium).toBe(45) // stored FishChanceMEDIUM
  const f = fishing({ HookLv: 6, FishingRodLv: 4, fishingLVL: 142, smithingFishingPower: 270256.5, FunnyHatPurchased: 2 })
  expect(f.tiers.small.p).toBeCloseTo(0.551, 3) // cutoff rule; 54% counted live over 100 catches
  expect(fishXp(9) * f.multi).toBeCloseTo(45459.88, 1) // stored EXPfromThatFish
})

test('away fishing matches the live screen-switch test (327 s away, +4.906e9 XP)', () => {
  const live = { fishingLVL: 143, FishChanceSMALL: 30.55, FishChanceMEDIUM: 45, FishChanceLARGE: 24.45, FishingTimeMin: 0.15356811382857613, FishingTimeMax: 0.15891632555558924,
    smithingFishingPower: 271924.75, SecretEarned: [0, 1, 1, 1], SmithingItemLevel: Object.assign([], { 35: 48 }), FunnyHatPurchased: 2 }
  const got = awayFishing(live, 30.5).perAwaySecond * 327
  expect(Math.abs(got / 4.906e9 - 1)).toBeLessThan(0.02)
})
