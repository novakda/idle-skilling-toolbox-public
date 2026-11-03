// The icon sheet list, kept free of browser APIs and JSON imports so vite.config.ts (Node) can use it to ship the art.
export type IconMaps = Record<string, Record<string, [string, number, number, number]>> // [file, frame, across, down]
export const ASSETS = 'distBuild/static/game/assets/'
export const g = (sprite: number, anim = 0) => `graphics/1x/sprite-${sprite}-${anim}.png`
/** Every sheet the maps use: what gets copied out of the player's asar, or shipped with VITE_SHIP_GAME_ART=1. */
export const sheetList = (maps: IconMaps, minions: string[]) => [...new Set([
  ...Object.values(maps).flatMap((m) => Object.values(m).map((e) => e[0])), g(870), g(1144), g(1173), g(798),
  ...minions.map((m) => `data/${m}.png`),
  ...Array.from({ length: 27 }, (_, i) => `data/Blessing${i}.png`),
])]
