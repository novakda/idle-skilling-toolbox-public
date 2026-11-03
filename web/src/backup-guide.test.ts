import { expect, test } from 'bun:test'
import { backupGuide } from './backup-guide'
import { LINKS } from './cards-calc'
import { BOSSES } from './raids'
import { localOnlyBackup } from './save-load'

test('backupGuide: names deck links, trek, AFK, raids from a real save', async () => {
  const save = await Bun.file(new URL('../../data/save.json', import.meta.url)).json()
  const g = backupGuide(localOnlyBackup(save))
  const v = (what: string) => g.find((x) => x.what === what)?.value
  const d = save.DeckLinkList.findIndex((l: number, i: number) => i > 0 && l > 0)
  expect(v(`Deck ${d} link`)).toBe(LINKS[save.DeckLinkList[d]])
  expect(v('Trekking zone')).toBe(`${save.CalibrationTrek} (background ${save.TrekkingBGselected})`)
  // raid bosses 2-4 come from IsbossB/C/Dunlocked, Asylum bosses 2-4 from IsBoss{B,C}2unlocked/IsbossD2unlocked (#30, #34)
  const names = (list: (string | null)[][]) => list.filter(([, key]) => key && save[key!]).map(([n]) => n).join(', ')
  if (names(BOSSES.raid)) expect(v('Raid bosses unlocked')).toBe(names(BOSSES.raid))
  if (names(BOSSES.asylum)) expect(v('Asylum bosses unlocked')).toBe(names(BOSSES.asylum))
  if ((save.AutoAdvanceToggle ?? []).some((x: number) => x)) expect(v('Auto-advance (AFK) on')).toBeDefined()
  else expect(v('Auto-advance (AFK) on')).toBeUndefined()
  expect(g.filter((x) => x.redo === 're-earn').length).toBeGreaterThan(0)
})
