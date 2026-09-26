/**
 * Names: for polities, for ships, and the colours factions are drawn in.
 */

import type { Rng } from "./rng";

const POLITIES = [
  "Compact", "Hegemony", "Concord", "League", "Directorate", "Protectorate", "Union",
  "Federation", "Commonwealth", "Assembly", "Syndicate", "Republic", "Dominion",
  "Confederacy", "Principality", "Coalition", "Combine", "Alliance", "Pact", "Autarchy",
];

/** "Barshenni Concord", from the capital's name. */
export function polityName(capital: string, rng: Rng): string {
  return `${capital} ${rng.pick(POLITIES)}`;
}

const SHIP_NAMES = [
  "Resolute", "Vigilant", "Intrepid", "Relentless", "Audacious", "Steadfast", "Tenacious",
  "Implacable", "Indomitable", "Valiant", "Defiant", "Dauntless", "Invincible", "Formidable",
  "Unyielding", "Sentinel", "Warden", "Harbinger", "Nemesis", "Retribution", "Vengeance",
  "Tempest", "Hurricane", "Cyclone", "Typhoon", "Maelstrom", "Thunderer", "Lightning",
  "Meteor", "Comet", "Nova", "Pulsar", "Quasar", "Zenith", "Nadir", "Solstice", "Equinox",
  "Aurora", "Corona", "Eclipse", "Parallax", "Perihelion", "Aphelion", "Farthing", "Sovereign",
  "Regent", "Marquis", "Baronet", "Seneschal", "Castellan", "Reeve", "Herald", "Envoy",
  "Emissary", "Courier", "Pathfinder", "Wayfarer", "Pilgrim", "Nomad", "Drifter", "Rover",
  "Ranger", "Outrider", "Vanguard", "Rearguard", "Picket", "Lancer", "Hussar", "Dragoon",
  "Cuirassier", "Grenadier", "Fusilier", "Halberd", "Glaive", "Partisan", "Falchion",
  "Scimitar", "Sabre", "Rapier", "Claymore", "Broadsword", "Gladius", "Kukri", "Stiletto",
  "Arbalest", "Mangonel", "Trebuchet", "Ballista", "Culverin", "Petard", "Bastion", "Redoubt",
  "Rampart", "Parapet", "Citadel", "Keep", "Barbican", "Portcullis", "Kestrel", "Merlin",
  "Peregrine", "Goshawk", "Harrier", "Osprey", "Condor", "Albatross", "Petrel", "Cormorant",
  "Heron", "Kingfisher", "Shrike", "Raven", "Rook", "Jackdaw", "Magpie", "Starling", "Swift",
  "Adder", "Viper", "Cobra", "Mamba", "Krait", "Taipan", "Asp", "Basilisk", "Wyvern",
  "Manticore", "Chimera", "Gryphon", "Hydra", "Kraken", "Leviathan", "Behemoth", "Colossus",
  "Titan", "Atlas", "Hyperion", "Prometheus", "Themis", "Rhea", "Tethys", "Phoebe", "Mimas",
  "Obstinate", "Contrary", "Wilful", "Headstrong", "Reckless", "Brazen", "Gallant", "Stalwart",
  "Loyal", "Faithful", "Constant", "Patient", "Prudent", "Sagacious", "Canny", "Shrewd",
  "Lodestar", "Polestar", "Evenstar", "Daystar", "Starfall", "Moonrise", "Sunward", "Coreward",
  "Rimward", "Spinward", "Trailing", "Longreach", "Farwatch", "Deepwatch", "Nightwatch",
];

/** A ship name nobody in the game is using yet, with a numeral once they run out. */
export function shipName(rng: Rng, taken: ReadonlySet<string>): string {
  for (let tries = 0; tries < 40; tries++) {
    const name = rng.pick(SHIP_NAMES);
    if (!taken.has(name)) return name;
  }
  const base = rng.pick(SHIP_NAMES);
  for (let n = 2; ; n++) {
    const name = `${base} ${roman(n)}`;
    if (!taken.has(name)) return name;
  }
}

function roman(n: number): string {
  const table: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [value, mark] of table) {
    while (n >= value) {
      out += mark;
      n -= value;
    }
  }
  return out;
}

/** Strong colours for humans, so a player's territory stands out. */
export const HUMAN_COLOURS = ["#e0b341", "#4fb3ff", "#ff5d73", "#5ee07a", "#c77dff", "#ff9f43"];

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** How different two colours look: the "redmean" weighting of RGB distance. */
export function colourDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  const r = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
}

/** Thirty-six colours for the computer's factions: twelve hues in three tones. */
const PALETTE: readonly string[] = (() => {
  const out: string[] = [];
  for (const [s, l] of [[62, 55], [48, 72], [66, 40]] as const) {
    for (let h = 0; h < 360; h += 30) out.push(hslToHex(h + 8, s, l));
  }
  return out;
})();

export interface Territory {
  readonly key: string;
  readonly hexes: readonly string[];
  /** A player's place in the list of players, where a player holds it. */
  readonly human?: number;
}

/**
 * Colours for every faction, chosen so that neighbours look different.
 *
 * Players take the strong colours in order. The computer's factions are then
 * coloured biggest first, each taking the palette colour that looks least like
 * any neighbour's within a few parsecs, least like any player's anywhere, and
 * least used so far. A colour can come round twice in a big sector, but not
 * next door.
 */
export function colourTerritories(territories: readonly Territory[], distance: (a: string, b: string) => number): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of territories) if (t.human !== undefined) out.set(t.key, HUMAN_COLOURS[t.human % HUMAN_COLOURS.length]!);
  const near = new Map<string, Map<string, number>>();
  for (const a of territories) {
    const row = new Map<string, number>();
    for (const b of territories) {
      if (a === b) continue;
      let d = Infinity;
      for (const x of a.hexes) for (const y of b.hexes) d = Math.min(d, distance(x, y));
      if (d <= 6) row.set(b.key, d);
    }
    near.set(a.key, row);
  }
  const used = new Map<string, number>();
  const humanColours = [...out.values()];
  const order = territories.filter((t) => t.human === undefined).sort((a, b) => b.hexes.length - a.hexes.length || a.key.localeCompare(b.key));
  for (const t of order) {
    let best = PALETTE[0]!;
    let bestScore = -Infinity;
    for (const c of PALETTE) {
      let score = Infinity;
      for (const [other, d] of near.get(t.key) ?? []) {
        const held = out.get(other);
        if (held === undefined) continue;
        // Close neighbours matter most: a similar colour next door counts for
        // far more than one six parsecs off.
        score = Math.min(score, colourDistance(c, held) / (1 + (6 - d) / 2));
      }
      score = Math.min(score, 1000);
      for (const h of humanColours) score = Math.min(score, colourDistance(c, h) * 2.2);
      score -= (used.get(c) ?? 0) * 60;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    out.set(t.key, best);
    used.set(best, (used.get(best) ?? 0) + 1);
  }
  return out;
}

/**
 * Faction colours: humans get the strong ones in order, the rest are spread
 * round the wheel by the golden angle so neighbours in the list differ. Kept for
 * games made before colours were chosen by neighbourhood.
 */
export function factionColour(index: number, human: boolean, humanIndex: number): string {
  if (human) return HUMAN_COLOURS[humanIndex % HUMAN_COLOURS.length]!;
  const hue = Math.round((index * 137.508 + 200) % 360);
  const light = 52 + (index % 3) * 8;
  return `hsl(${hue} 45% ${light}%)`;
}
