// Raid and Asylum difficulty tiers (pure data, core): split from raids.ts (refactor step 9, #72). raids.ts re-exports it.

/** Difficulty buttons: TicketsToSpend (also the boss's difficulty multiplier), tickets actually taken, RaidTotalTime (minutes).
 *  Raids @19790186-19791587, deducted HellTickets − TicketsToSpend @20036057. Asylum @26160736-26162845, deducted
 *  AsylumTickets − round(TicketsToSpend / 1, 1, 2, 3) @27004488-27006342. */
export const TIERS = {
  raid: { currency: 'HellTickets', tiers: [['Daydream', 1, 1, 2], ['Chaotic', 3, 3, 4], ['Nightmare', 10, 10, 6]] },
  asylum: { currency: 'AsylumTickets', tiers: [['', 1, 1, 2], ['X', 3, 3, 3], ['Y', 14, 7, 5], ['Z', 45, 15, 8]] },
} as const
