/**
 * Plays a whole game with the computer on every side and prints how it went:
 * who holds what, how many battles, how many ships lost. For tuning the rules.
 *
 *   npx vite-node scripts/simulate.ts [file.sector] [days] [seed] [letters] [mains|allegiance]
 */
import { readFileSync } from "node:fs";
import { bundledDesigns } from "../src/catalogue/catalogue";
import { parseSectorFile } from "../src/sector/sectorfile";
import { createGame, DEFAULT_OPTIONS } from "../src/game/setup";
import { aiSetup, runDays } from "../src/game/turn";
import { income } from "../src/game/rules";

const [file = "sectors/Driftwater-Reach.sector", daysText = "200", seed = "SIM", letters = "ABCDEFGHIJKLMNOP", empiresFrom = "mains"] = process.argv.slice(2);
const sector = parseSectorFile(readFileSync(file, "utf8"));
const game = createGame({
  name: "Simulation",
  sector,
  area: letters.split(""),
  players: [],
  options: { ...DEFAULT_OPTIONS, empiresFrom: empiresFrom === "allegiance" ? "allegiance" : "mains" },
  designs: bundledDesigns(),
  seed,
});
aiSetup(game);
const s = game.state;
console.log(`${s.factions.length} factions, ${game.catalogue.all().length} ship classes, ${s.sector.worlds.length} worlds`);
const summary = () =>
  s.factions
    .filter((f) => f.alive)
    .map((f) => {
      const worlds = game.ownedWorlds(f.id);
      const ships = game.fleetsOf(f.id).reduce((n, fl) => n + fl.ships.length, 0);
      const inc = worlds.reduce((t, w) => t + income(w), 0);
      return { f, worlds: worlds.length, ships, inc };
    })
    .sort((a, b) => b.worlds - a.worlds);
for (const row of summary().slice(0, 12)) {
  console.log(`  ${row.f.name.padEnd(28)} ${row.f.personality.padEnd(12)} worlds ${String(row.worlds).padStart(3)} ships ${String(row.ships).padStart(3)} income ${row.inc.toFixed(1).padStart(6)} MCr${row.f.credits.toFixed(0)}`);
}
// NORELATIONS=1 plays it the old way, everyone at war with everyone, for comparison.
if (process.env["NORELATIONS"] === "1") delete s.relations;
const wars = () => Object.values(s.relations ?? {}).filter((r) => r.war).length;
const alliances = () => Object.values(s.relations ?? {}).filter((r) => r.allied === true).length;
console.log(`day 0: wars ${wars()} of ${Object.keys(s.relations ?? {}).length} pairs`);
const t0 = Date.now();
const days = Number(daysText);
for (let d = 0; d < days && s.phase === "play"; d += 25) {
  runDays(game, Math.min(25, days - d));
  const uniq = (kind: string) => new Set(s.log.filter((e) => e.kind === kind).map((e) => `${e.happened ?? e.day}|${e.text}`)).size;
  const battles = uniq("combat");
  const captures = uniq("capture");
  const ships = s.fleets.reduce((n, f) => n + f.ships.length, 0);
  const inTransit = s.fleets.filter((f) => f.transit !== null).length;
  const neutral = Object.values(s.worlds).filter((w) => w.owner === null).length;
  console.log(`day ${s.day}: battles ${battles}, captures ${captures}, ships ${ships}, fleets in jump ${inTransit}/${s.fleets.length}, independent worlds ${neutral}, wars ${wars()}, alliances ${alliances()}, factions alive ${s.factions.filter((f) => f.alive).length}`);
}
console.log(`${((Date.now() - t0) / Math.max(1, s.day)).toFixed(1)} ms a day`);
for (const row of summary().slice(0, 12)) {
  console.log(`  ${row.f.name.padEnd(28)} ${row.f.personality.padEnd(12)} worlds ${String(row.worlds).padStart(3)} ships ${String(row.ships).padStart(3)} income ${row.inc.toFixed(1).padStart(6)} MCr${row.f.credits.toFixed(0)}`);
}
if (s.winner !== null) console.log(`Winner: ${game.faction(s.winner).name} on day ${s.day}`);
const treaties = [...new Set(s.log.filter((e) => e.kind === "diplomacy").map((e) => `day ${e.happened ?? e.day}: ${e.text}`))];
console.log(`
${treaties.filter((t) => t.includes("declares war")).length} declarations of war, ${treaties.filter((t) => t.includes("make peace")).length} peaces, ${treaties.filter((t) => t.includes("become allies")).length} alliances${treaties.length > 0 ? ":" : "."}`);
for (const line of treaties.slice(0, 30)) console.log(`  ${line}`);
const sample = s.log.filter((e) => e.kind === "combat").slice(0, 1)[0];
if (sample !== undefined) console.log(`\nFirst battle, day ${sample.day}: ${sample.text}\n${(sample.detail ?? []).slice(0, 25).join("\n")}`);
