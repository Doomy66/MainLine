/**
 * Empires from a sector's allegiances: each polity's worlds in the area shared
 * out into Mains of its own, so that a sector imported with the Imperium and
 * the Zhodani in it starts with them.
 *
 * A polity is not one Empire. The Imperium in the Spinward Marches is two
 * hundred and seventy worlds strung across the whole sector, and as one Empire
 * it would rule half its people on the first day. Its Mains are, as Mains are
 * anywhere: runs of its worlds a jump-1 ship can cross. But a polity's worlds
 * are not all on a Main. Some sit a parsec or two off one, and some polities,
 * the Aslan clans most of all, hold worlds two parsecs apart and no Main at
 * all. So the worlds within two parsecs of a Main of their own polity join
 * it, and what is left is grouped at jump-2, as a jump-2 polity would hold it.
 * Groups too small to be an Empire, and every world that is non-aligned, start
 * independent.
 */

import { hexDistance } from "./hex";
import { capitalFirst, mainsIn, type Main } from "./mains";
import type { Polity, World } from "./sec";

/** A Main that belongs to a polity. */
export interface PolityMain extends Main {
  readonly allegiance: string;
}

/** Non-aligned codes, and the blanks some files write, which nobody holds. */
export function claimedBy(world: World): string | null {
  const code = (world.allegiance ?? "").trim();
  if (code === "" || code === "--" || code.startsWith("Na")) return null;
  return code;
}

/**
 * A polity's name without the part of it a world is in: "Third Imperium" for
 * "Third Imperium, Domain of Deneb". Empty where the sector does not name it.
 */
export function polityFamily(polities: readonly Polity[] | undefined, code: string): string {
  const polity = polities?.find((p) => p.code === code);
  return polity?.name.split(",")[0]!.trim() ?? "";
}

/**
 * The polity a client state belongs to, by name: "Third Imperium" for
 * "Client state, Third Imperium". Empty where the sector does not say.
 */
export function clientOf(polities: readonly Polity[] | undefined, code: string): string {
  const polity = polities?.find((p) => p.code === code);
  const comma = polity?.name.indexOf(",") ?? -1;
  return comma < 0 ? "" : polity!.name.slice(comma + 1).trim();
}

/** How far off a Main of its own polity a world can lie and still be part of it. */
const ATTACHED = 2;

export function polityMains(worlds: readonly World[], minWorlds: number): PolityMain[] {
  const byCode = new Map<string, World[]>();
  for (const w of worlds) {
    const code = claimedBy(w);
    if (code !== null) byCode.set(code, [...(byCode.get(code) ?? []), w]);
  }
  const out: PolityMain[] = [];
  for (const [code, held] of byCode) {
    const cores = mainsIn(held, 1).filter((m) => m.hexes.length >= minWorlds);
    const owner = new Map<string, number>();
    cores.forEach((m, i) => m.hexes.forEach((at) => owner.set(at, i)));
    const groups = cores.map((m) => [...m.hexes]);

    // Worlds near a Main join the nearest, a step at a time, so a world two
    // parsecs off one that has just joined counts as near too.
    let joined = true;
    while (joined) {
      joined = false;
      for (const w of held) {
        if (owner.has(w.at)) continue;
        let best: { group: number; distance: number } | null = null;
        for (const other of held) {
          const group = owner.get(other.at);
          if (group === undefined) continue;
          const distance = hexDistance(w.hex, other.hex);
          if (distance <= ATTACHED && (best === null || distance < best.distance)) best = { group, distance };
        }
        if (best === null) continue;
        owner.set(w.at, best.group);
        groups[best.group]!.push(w.at);
        joined = true;
      }
    }

    // The rest, grouped at jump-2.
    const rest = held.filter((w) => !owner.has(w.at));
    const left = new Set(rest.map((w) => w.at));
    for (const start of rest) {
      if (!left.has(start.at)) continue;
      const group = [start];
      left.delete(start.at);
      for (let i = 0; i < group.length; i++) {
        for (const other of rest) {
          if (!left.has(other.at) || hexDistance(group[i]!.hex, other.hex) > ATTACHED) continue;
          left.delete(other.at);
          group.push(other);
        }
      }
      if (group.length >= minWorlds) groups.push(group.map((w) => w.at));
    }

    const byHex = new Map(held.map((w) => [w.at, w]));
    for (const hexes of groups) {
      const capital = hexes.map((at) => byHex.get(at)!).sort(capitalFirst)[0]!;
      out.push({ name: capital.name, hexes: [...hexes].sort((a, b) => a.localeCompare(b)), capital: capital.at, allegiance: code });
    }
  }
  return out.sort((a, b) => b.hexes.length - a.hexes.length || a.name.localeCompare(b.name));
}
