<script setup lang="ts">
const shipped = import.meta.env.VITE_SHIP_GAME_ART === '1' // build setting, README "Game art in the build"
</script>

<template>
  <div class="page-head">
    <h2>About</h2>
    <p>What this tool is, where its numbers come from, and how to back up what a Steam Cloud restore loses.</p>
  </div>
  <article class="about">
    <p>
      A free fan tool for <a href="https://store.steampowered.com/app/1048370/" rel="noopener">Idle Skilling</a>.
      It is not made by, endorsed by, or affiliated with Lavaflame2. Idle Skilling and its names belong to them.
    </p>
    <p>
      Your save is read in your browser and never uploaded. Nothing is stored on a server; per-deck link choices and
      a few inputs are kept in your browser's local storage.
    </p>

    <h3>Where the data comes from</h3>
    <ul>
      <li><b>The game itself.</b> Card, potion and shrine values, costs, drop rules and AFK rules were computed from the game's own code.
        <template v-if="shipped">Game icons are included in this build, taken from the game's own files; they belong to Lavaflame2.</template>
        <template v-else>No game art is included: icons appear only if you load your own install (sidebar, "Load game icons").</template></li>
      <li><b><a href="https://idle-skilling.fandom.com/wiki/Idle_Skilling_Wiki" rel="noopener">Idle Skilling Wiki</a></b> (Fandom contributors): card zones. Used under <a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noopener">CC BY-SA 3.0</a>.</li>
      <li><b><a href="https://docs.google.com/spreadsheets/d/10yruc84LIIKtTUxwYqBMEQTb-IggGKpz79BUbuEyDpo" rel="noopener">Kyromyr's Idle Skilling Notes</a>:</b> shrine names.</li>
      <li><b><a href="https://docs.google.com/spreadsheets/d/1bgGR6ZbQG2TLRTwy6uGoRxSRtmmg9iqRFikExs59CQo" rel="noopener">Idle Skilling Infodoc (Potions only)</a></b>, split from SGResponse's original Infodoc: potion bonus text and stacking groups.</li>
      <li><b><a href="https://docs.google.com/spreadsheets/d/1vu4VXiqL9GkI9qOgsIBn_Znx-j_iLOCrVGUrgAJYMrQ" rel="noopener">IdleSkilling recommended Decks</a>:</b> the guide decks on the Cards page.</li>
    </ul>
    <p class="muted">Thanks to everyone who wrote these guides. If you made one of them and want the credit or link changed, or the data removed, let me know.</p>
  </article>
</template>

<style scoped>
.about { max-width: 720px; line-height: 1.5; }
h3 { font-size: 16px; margin: 20px 0 6px; }
li { margin: 6px 0; }
a { color: var(--accent); }
.muted { color: var(--muted); font-size: 14px; }
</style>
