/**
 * What a faction can see. News travels no faster than ships, so a faction sees
 * the systems where it holds a world or has a fleet, and nothing else; what it
 * saw elsewhere is a sighting, as old as the day it was made.
 */

import type { Game } from "./game";

export function visibleSystems(game: Game, factionId: string): Set<string> {
  const out = new Set<string>();
  for (const [at, ws] of Object.entries(game.state.worlds)) if (ws.owner === factionId) out.add(at);
  for (const f of game.state.fleets) if (f.owner === factionId && f.transit === null) out.add(f.system);
  return out;
}
