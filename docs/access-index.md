# Access index (#2643)

Answers "does any game logic read X?" for a game-attribute element, without regex windows.

| Tool | What it does |
|---|---|
| `bun src/access-index.ts` | Parses `Qno2x.js` with acorn (~2 s, ~1.2 GB RSS; ~4 s total, peak ~1.6 GB) and writes `data/access-index.sqlite` (~24 MB, git-ignored). Re-run after every game update; the query CLI warns when the bundle is newer than the index. |
| `bun src/access-query.ts …` | Queries the index. Named flags only. |
| `bun src/read-trace.ts …` | Live check over CDP: counts real reads per index for N seconds, with call sites. |

## Queries

```sh
bun src/access-query.ts --attr RealmStuff --path 13.6           # everything that could read RealmStuff[13][6]
bun src/access-query.ts --attr PotionLV --index 91
bun src/access-query.ts --attr GenINFO --path 52 --cls ActorEvents_1488   # actor fields (this._GenINFO) too
bun src/access-query.ts --attr RealmStuff                       # access counts by first index
bun src/access-query.ts --key ShrineUpgCost                     # "ShrineUpgCost"==t branch, accesses inside it, call sites
bun src/access-query.ts --key MinionTraitALL --arg 3            # call sites whose 1st arg after the key is 3, or computed
bun src/access-query.ts --key MinionTrait --arg 70 --argpos 2   # … 2nd arg after the key
```

Sections in an `--attr` answer:

- **LITERAL**: the exact path, e.g. `G("RealmStuff")[13][6]`, or through an alias (`E=G("RealmStuff")[13]; E[6]`).
- **COMPUTED INDEX**: a computed subscript on the path (`E[num(T)+this._DRI]`) that could be this element. Each row shows the
  index expression with Haxe casts collapsed to `num(x)`, `G` for `b.engine.getGameAttribute`, and the last assignment of each
  identifier in it (`T=this._GenINFO[25]`, `a=param 2 of _customBlock_MinionInfo`).
- **CONTAINER**: the whole array/record is used (passed to a function, iterated, indexed by an unknown first index); the element is unknown.
- **CONTAINER WRITES**: init pushes and whole replacements.

Each row: `@offset kind attr[path]  class function {Helper:Key}  UI(signals)|logic  via alias @offset`.
Kinds: `read`, `write` (`write+=` …), `alias` (a local now names this array; its uses are separate rows with `via`), `pass`,
`iter`, `length`, `call:push` and other method calls. Offsets point inside the attribute's string literal (or at the alias name).

**Verdict line**: `no logic read`, or counts of literal logic reads (with offsets), computed-index logic candidates and
whole-container logic uses to inspect. A row is UI when its own function (nested functions excluded) draws or handles the mouse
(`.font=`, `getTextWidth`, `drawRect`, `drawImage`, `GrowImgInstt`, `setText`, `mouseywithin`, `getMouseX/Y`, `setOrderForImage`, …)
or is an `addMouse…Listener` callback. A draw listener alone is *not* UI: the game runs per-frame logic in them. A row inside a
`"<Key>"==t` branch of a `_customBlock_*` helper is UI when every call site of that key is UI (one level). Rows in a function that calls
`addSaveEntry` are save writers, reported apart from logic.

## Live tracer

```sh
bun src/read-trace.ts --seconds 60                      # default: --watch RealmStuff.13 --watch PotionLV:91
bun src/read-trace.ts --watch RealmStuff.13:5,6 --watch DNSM --seconds 30
```

`ATTR[.i.j]` names the array to wrap; `:k,l` limits counting to those indices. The original array is replaced by a Proxy that
forwards every get/set unchanged, and is put back at the end (also on Ctrl-C, and by a page timer if the CLI dies) only if the slot
still holds the Proxy. Output: the screen at start/end, reads per index, each call site resolved through the index (function, UI/logic,
nearest access row), and the first few stacks per index. `(no game frame)` sites are CDP evaluates from other tools.

## Limits

- Aliases are tracked in source order, per function scope: a reassignment ends an alias, but branches are not merged
  (`if(c)t=G("A");else t=G("B")` leaves `t` = B), and a closure sees the alias state where it is *defined*, not where it runs.
- Values that flow through anything but a local variable are not followed: object fields (`this._x=G("RealmStuff")[13]`),
  function parameters, return values, Haxe map keys (`DNSM.h[""+a]`), and `getGameAttribute(nonLiteral)` (indexed as attr `*`).
- `_GenINFO`-style fields are per behavior class: filter with `--cls`.
- Computed indices are not evaluated: `PotionLV[G("PotionSelected")-1]` is a candidate for every potion.
- UI/logic is a hint from text signals: logic inside a UI function (buy handlers) counts as UI; key-following is one level deep.
- The live tracer only sees reads made through the attribute slot while the Proxy is in place, on the screens visited during the run;
  code that cached the array before the run is not counted.
