// Tests compare ports against the values a full local save stores. data/save.json changes on every extract and can catch
// the game mid-update (e.g. a boost computed before a deck swap), so tests read a frozen snapshot when one exists:
// data/fixture-save.json (gitignored, personal data; refresh with `cp data/save.json data/fixture-save.json` after the
// game has sat on a screen for a minute).
export async function fullSave(): Promise<any> {
  const fixture = Bun.file(new URL('../../data/fixture-save.json', import.meta.url))
  return (await fixture.exists()) ? fixture.json() : Bun.file(new URL('../../data/save.json', import.meta.url)).json()
}
