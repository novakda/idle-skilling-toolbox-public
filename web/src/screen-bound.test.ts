import { expect, test } from 'bun:test'
import { SCREEN_BOUND } from './screen-bound'
import screens from './data/screens.json'

test('screen-bound registry: every entry has a known writer and a Qno2x.js offset; every model it names exists', async () => {
  for (const [k, b] of Object.entries(SCREEN_BOUND)) {
    if (b.writer !== 'mastery-scene') for (const w of [b.writer].flat()) expect(screens, `${k} writer`).toHaveProperty(String(w))
    expect(b.at, `${k} offset`).toMatch(/@\d{6,}/)
    if (b.exact) expect(b.model, `${k}: exact needs a model`).toBeDefined()
    if (!b.model) continue
    const [mod, fn] = b.model.split('#')
    expect(typeof (await import(`./${mod}`))[fn!], `${k} model ${b.model}`).toBe('function')
  }
})
