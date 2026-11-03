# Combat skills: how each one unlocks

Verified 2026-10-28 against the game code (Qno2x.js) and the author's live save over CDP. Wiki names; the wiki's
Fight page is from 2022 and lists Strafe and Haste-era unlocks loosely.

| Skill | Bar / key | Unlocked by | Save flag |
|---|---|---|---|
| Claw, Poison, Meteor, Flurry, Smite, Vision, Midas, Seal, Valor, Anion, Icies, Mark | skill bars 1-2 | perk trees (Red / Orange / Green / Gray) | `SkillLevels` |
| Heal | skill bar 1, key 1 | default | none |
| Banana Bonk | special bar, key 3 (slot 13) | White Key AP perk | `KeysUnlocked[27]` |
| Shoulder Tap | special bar, key 4 (slot 14) | White Key AP perk | `KeysUnlocked[28]` |
| Vamp | special bar, key 5 (slot 15) | the Little Guy in the Asylum (all 5 steps; see the Asylum page) | `LittleGuyProgression > 4` |
| Strafe (code name "Haste") | special skill bar, SkillType 4 | clicking Mini Lava on the Portal screen: about 1 in 134 clicks drops a key (ActorEvents_1303, rolls 4-7 of `randomInt(4,540)`) | `HasteUnlocked > 0` (local save only, not in the cloud save) |

Notes

- Strafe and Haste are the same skill. `web/src/fighting.ts` `strafe()` reads it; mastery task 77 is
  USE_THE_HASTE_BUFF.
- Vamp: 3 leeches (`VampireLeeches`, up to 20 in code) that hit and heal by `VampHealPercent`, shield first;
  35 s cooldown, 7 s duration. Mastery task: USE_THE_VAMPIRE_ATTACK_MOVE.
- `HasteUnlocked` lives only in the local save, so a cloud restore can drop it and relock Strafe (seen 2026-10-24);
  the fix is clicking Mini Lava again.
- As of 2026-10-28 every unlock above is set on the author's save; Vamp was the last one.
