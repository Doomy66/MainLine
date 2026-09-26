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
const HUMAN_COLOURS = ["#e0b341", "#4fb3ff", "#ff5d73", "#5ee07a", "#c77dff", "#ff9f43"];

/**
 * Faction colours: humans get the strong ones in order, the rest are spread
 * round the wheel by the golden angle so neighbours in the list differ.
 */
export function factionColour(index: number, human: boolean, humanIndex: number): string {
  if (human) return HUMAN_COLOURS[humanIndex % HUMAN_COLOURS.length]!;
  const hue = Math.round((index * 137.508 + 200) % 360);
  const light = 52 + (index % 3) * 8;
  return `hsl(${hue} 45% ${light}%)`;
}
