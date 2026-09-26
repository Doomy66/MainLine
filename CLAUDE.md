# Mainline

Turn-based Traveller strategy game. Vite + TypeScript, no framework, vitest.

- `npm test` must pass before a commit; it includes a 100-day all-computer game.
- `npx vite-node scripts/simulate.ts sectors/Driftwater-Reach.sec 300` plays a whole game and prints how it went. Use it after changing combat, sieges, the economy or the AI.
- `npx vite-node scripts/check-ships.ts` validates every `.ship` in `ships/`.

## Keep in step

- **`public/help.html` is the player's rulebook.** Any change to a rule, a number, an order, a screen or a setup option changes it too, in the same commit. The figures in it (jump days, fuel prices, repair rates, capture days, combat modifiers) must match `src/game/rules.ts` and `src/game/combat.ts`.
- `README.md` summarises the same rules more briefly; keep it true.
- `CHANGELOG.md` gets a line for anything a player would notice.

## Where things come from

- Sectors are PlanetHex `.sec` exports. The game never generates worlds.
- `src/shipdesign/` is a verbatim copy of the Traveller-Ship-Design engine. Do not edit it here; change it there and copy it over.
- Ship classes are `.ship` files in `ships/`, with sources in `ships/SOURCES.md`.
- Saves are one `.game` JSON file holding the whole state, sector and designs included.

## Style

Comments and player-facing text in plain British English, no em dashes. Code comments explain why, in the manner of the existing files.
