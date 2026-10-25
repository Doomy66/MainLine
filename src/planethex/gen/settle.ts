import { normalise } from "../ui/colour";
import { coverAt, rockAt, temperatureAt, type BiomeWorld } from "./biome";
import { isIced, type IceCaps } from "./ice";
import { warmthAt } from "./life";
import { compactNumber } from "./detail";
import { valueFor } from "./rng";
import type { CellId, Grid } from "../grid/grid";

/**
 * Where a world's people are. Spec 6.24.
 *
 * The profile says how many there are and says nothing about where. The surface
 * says where the ground is worth living on and says nothing about how many. Put
 * the two together and a world can arrive with its settlements on it, the way
 * 6.5.8 already has it arrive with its starport.
 *
 * What decides a site is habitability, and that is the biome model of 5.8 read as
 * a question about people rather than about plants: food grows where cover grows,
 * a coast is worth more than an inland plain, mountains and ice are worth less
 * than either, and a world with no land worth the name puts its cities on the
 * water instead of pretending it has a shore.
 *
 * Settlements are spread rather than merely ranked. The best sites on a world are
 * all in the same place - the same continent, often the same bay - and taking the
 * top N of them puts every city on the planet within a few hexes of each other.
 * So each one chosen pushes the score down around it, and the next is the best of
 * what is left.
 */

/* Habitability ------------------------------------------------------------- */

/**
 * What ground with nothing growing on it is still worth. Bare rock under a dome
 * is somewhere people live; it is just a worse somewhere than a river valley.
 */
const BARE_GROUND = 0.25;

/** What a coast adds. Half the cities on Earth are on one. */
const COASTAL = 0.2;

/**
 * What open water is worth at its best. Below bare ground, so a world with any
 * land puts its people on it, and above nothing, so a world without any still has
 * somewhere to put them. A city at sea floats on the shelf or sits under it, and
 * either way it wants the shelf rather than four kilometres of open ocean.
 */
const WATER = 0.22;

/** How much of the way to the deep the shelf is worth anything. */
const SHELF_FLOOR = 0.34;

/** What ice does to a site, over land or over water. */
const ICED = 0.3;

/** How far apart settlements push each other, in radians on the unit sphere. */
const SEPARATION = 0.38;

/**
 * How habitable one hex is, from 0 for nowhere anyone would go to about 1.4 for a
 * temperate coast with things growing on it.
 */
export function habitability(
  world: BiomeWorld,
  n: number,
  sinLat: number,
  iced: boolean,
  coastal: boolean,
): number {
  if (n <= 0.5) {
    // Shelf sea down to deep ocean, and only as warm as the latitude allows: an
    // ocean world is still a world people freeze on at its poles.
    const shelf = n <= SHELF_FLOOR ? 0 : (n - SHELF_FLOOR) / (0.5 - SHELF_FLOOR);
    return WATER * shelf * warmthAt(temperatureAt(world, sinLat)) * (iced ? ICED : 1);
  }
  const ground = BARE_GROUND + (1 - BARE_GROUND) * coverAt(world, sinLat);
  return (ground + (coastal ? COASTAL : 0)) * (1 - rockAt(n)) * (iced ? ICED : 1);
}

/* Siting ------------------------------------------------------------------- */

/**
 * The hexes a world's settlements stand on, best first.
 *
 * `taken` holds the sites already spoken for - the starport of 6.5.8, which under
 * 6.24.1 is the world's first city - so the rest are sited around it rather than
 * on top of it.
 */
export function settlementSites(
  grid: Grid,
  heights: Float64Array,
  seaLevel: number,
  world: BiomeWorld,
  caps: IceCaps | null,
  count: number,
  taken: readonly CellId[] = [],
): CellId[] {
  if (count <= 0 || grid.cells.length === 0) return [];

  const isLand = (id: CellId) => heights[id]! > seaLevel;
  const score = new Float64Array(grid.cells.length);
  for (const cell of grid.cells) {
    const land = isLand(cell.id);
    const coastal = land && cell.neighbours.some((id) => !isLand(id));
    score[cell.id] = habitability(
      world,
      normalise(heights[cell.id]!, seaLevel),
      cell.centre[1],
      isIced(caps, cell.centre[1]),
      coastal,
    );
  }

  const chosen: CellId[] = [];
  for (const cell of taken) push(grid, score, cell);
  for (let i = 0; i < count; i++) {
    let best: CellId | null = null;
    let bestScore = 0;
    for (const cell of grid.cells) {
      if (score[cell.id]! > bestScore) {
        bestScore = score[cell.id]!;
        best = cell.id;
      }
    }
    // Nothing left worth anything, which is a world with more settlements wanted
    // than it has room to separate them. Better a short list than a heap.
    if (best === null) break;
    chosen.push(best);
    push(grid, score, best);
  }
  return chosen;
}

/**
 * Push the scores around a chosen site down, so the next one is somewhere else.
 * The site itself goes to nothing and the falloff is gentle enough that a world
 * with one good continent still puts its second city on it.
 */
function push(grid: Grid, score: Float64Array, at: CellId): void {
  const centre = grid.cells[at]?.centre;
  if (!centre) return;
  for (const cell of grid.cells) {
    const dot =
      centre[0] * cell.centre[0] + centre[1] * cell.centre[1] + centre[2] * cell.centre[2];
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    const t = angle / SEPARATION;
    score[cell.id] = score[cell.id]! * (1 - Math.exp(-t * t));
  }
}

/* How many, and how large -------------------------------------------------- */

/**
 * How many settlements a world carries, the starport included. Spec 6.24.2: one
 * per point of the population digit, so a world of a thousand people has three
 * places worth naming and a world of billions has nine.
 */
export const MAX_SETTLEMENTS = 15;

export function settlementCount(populationDigit: number): number {
  return Math.max(0, Math.min(MAX_SETTLEMENTS, Math.trunc(populationDigit)));
}

/**
 * How much of a world's population lives in a settlement large enough to name.
 *
 * Not all of it, and the figure is a guess rather than a derivation. People live
 * on farms, in hamlets, down mines, on rigs at sea, and on a world with a decent
 * starport a good many of them live in orbit and never touch the surface at all.
 * None of that is on the map, and none of it should be added up into the cities
 * that are: the settlement figures of 6.24.3 are not meant to total the world's
 * population, and a referee who wants the difference accounted for has the world's
 * own figure on the summary panel to take them from.
 */
const URBAN_SHARE = 0.7;

/**
 * How a world's settled people divide between its settlements. Spec 6.24.3.
 *
 * Zipf's law: rank a region's cities by size and the second is about half the
 * first, the third a third of it, the tenth a tenth. It holds across every settled
 * region anyone has counted, from Roman Egypt to the present, which makes it about
 * as safe a guess as this application makes anywhere. So the starport, being the
 * first city under 6.24.1, is the primate city and the rest fall away behind it.
 */
export function populationShares(count: number, total: number): number[] {
  if (count <= 0) return [];
  let harmonic = 0;
  for (let r = 1; r <= count; r++) harmonic += 1 / r;
  const settled = total * URBAN_SHARE;
  return Array.from({ length: count }, (_, i) => Math.round(settled / ((i + 1) * harmonic)));
}

/* Names -------------------------------------------------------------------- */

/**
 * What a world's settlements are called. Spec 6.24.6.
 *
 * A world names its places in one voice, not five. Whoever landed there spoke
 * some language and brought some habit of naming with them, and a map with
 * Barreach next to Ishkhuur next to Depot Three on it reads like three worlds
 * filed together by mistake. So a flavour is drawn once per planet from the seed,
 * and every settlement on that world is named in it.
 *
 * Polyglot is the common case, and deliberately so. A Traveller sector is a
 * thousand years of several species and a dozen languages settling each other's
 * worlds, and most of its names are that mixture rather than any one tongue kept
 * clean. The others are the cases where one did survive, or where nobody bothered.
 *
 * Whatever comes out is the user's to type over, as everything else about a
 * settlement is.
 */

/** How an index is drawn. `index` defaults to the settlement's rank; pass 0 for a
 *  draw the whole world shares, such as which word a functional world numbers. */
type Pick = (stream: string, count: number, index?: number) => number;

export interface Flavour {
  readonly key: string;
  /** How often this flavour comes up, against the others. */
  readonly weight: number;
  make(pick: Pick, rank: number): string;
  /**
   * How this flavour names a whole world, where that differs from how it names
   * a settlement. Left out, a world is named the way its first settlement would
   * be, which is right for every flavour that does not count things.
   */
  world?(pick: Pick): string;
}

/* Polyglot: the mixture a thousand years of settlement leaves behind. Vowel-rich
   stems from no one language, with endings that could have come from any. */
const POLY_STEM = [
  "Ala", "Bori", "Cala", "Dara", "Emi", "Fane", "Gala", "Heri", "Imu", "Jora",
  "Kali", "Lome", "Mira", "Nuri", "Oda", "Pala", "Rhoda", "Sura", "Tovi", "Ulan",
  "Vera", "Yani", "Zeru", "Asha", "Ketu", "Nima", "Orsa", "Tala", "Ubri", "Wela",
  "Andi", "Beru", "Caspi", "Deva", "Enno", "Feli", "Gorra", "Haly", "Ilva", "Junn",
  "Kora", "Lassa", "Muri", "Nydia", "Ostra", "Praxi", "Quela", "Rovi", "Selka", "Tirra",
  "Umbra", "Vasha", "Wynne", "Xola", "Yorro", "Zaida", "Amri", "Belu", "Corsa", "Dumi",
];
const POLY_END = [
  "ne", "x", "nth", "va", "ri", "sh", "dor", "mar", "la", "th",
  "kai", "sen", "tu", "por", "an", "is", "ora", "um", "ez", "ai",
  "vek", "nil", "ash", "oru", "tan", "wei", "dra", "lok", "shi", "arn",
];

/* Anglic: English place-name elements, which is what a world settled out of the
   Solomani rim sounds like. -combe, -wold, -ford and -mere are all real ones. */
const ANGLIC_HEAD = [
  "Kar", "Val", "Ter", "Mor", "Sel", "Dun", "Bar", "Ash", "Cor", "Rhen",
  "Tal", "Vos", "Lin", "Grim", "Ord", "Pel", "Sav", "Ked", "Bran", "Iro",
  "Wen", "Mar", "Hal", "Stor", "Ferr", "Glen", "Thor", "Ayl", "Brack", "Cinder",
  "Dray", "East", "Foss", "Garth", "Hart", "Kirk", "Long", "Nether", "Ram", "Wester",
];
const ANGLIC_TAIL = [
  "port", "hold", "reach", "mere", "fell", "gate", "march", "stead", "combe", "ridge",
  "haven", "cross", "vale", "watch", "landing", "rise", "deep", "wold", "ford", "spire",
  "barrow", "moor", "thorpe", "wick", "burn", "close", "dale", "hollow", "shaw", "strand",
];

/* Vilani: the First Imperium's own tongue, and the one that most often survived
   where it was not displaced. Heavy on kh and sh, doubled consonants, long vowels. */
const VILANI_HEAD = [
  "Ish", "Lakh", "Dig", "Mesh", "Nag", "Girr", "Ashk", "Vlan", "Zir", "Kagg",
  "Shud", "Umm", "Barsh", "Enk", "Ikk", "Mag", "Shar", "Tuk", "Urd", "Khan",
  "Anki", "Dush", "Gamm", "Hurr", "Kish", "Luur", "Mikk", "Nirg", "Pash", "Rukh",
  "Sagg", "Teng", "Ushk", "Vugg", "Zhen", "Amkh", "Berr", "Dakk", "Ennu", "Garr",
];
const VILANI_TAIL = [
  "kha", "shii", "uur", "dur", "gii", "mesh", "kar", "nuu", "shak", "gir",
  "tii", "lum", "zaa", "khii", "nam", "rii", "aan", "ushi",
  "makh", "shur", "enni", "dagg", "irru", "khan", "lugg", "nesh", "puur", "zhii",
  "arka", "immi",
];

/* Founder: named for whoever got there first, which is what a recently settled
   world does. Half of them keep the possessive and half have worn it off. */
const FOUNDERS = [
  "Kemp", "Halloran", "Salazar", "Okonkwo", "Duvall", "Restrepo", "Naidu",
  "Bergman", "Achebe", "Ortiz", "Fenwick", "Nakamura", "Solano", "Weir",
  "Castellan", "Lindqvist", "Abara", "Voss", "Mahoney", "Petrakis",
  "Adeyemi", "Blanchard", "Cheng", "Delacroix", "Eriksen", "Faulkner", "Gurung",
  "Haddad", "Ivanova", "Jarrett", "Kowalski", "Larsen", "Mbeki", "Novak",
  "Oyelaran", "Pradhan", "Quintero", "Rasmussen", "Sokolov", "Tanaka",
];
const FOUNDER_PLACE = [
  "Landing", "Rest", "Down", "Station", "Crossing", "Reach", "Field",
  "Point", "Camp", "Bluff", "Hollow", "Wharf", "Yard", "Bend", "Post",
];

/* Functional: a world nobody named. One word, drawn once, and a number each. The
   numbering runs with the rank, so the largest settlement is the first one built. */
const FUNCTIONAL = ["Site", "Station", "Camp", "Depot", "Hub", "Works", "Post", "Sector"];
const NUMERALS = [
  "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
];

export const FLAVOURS: readonly Flavour[] = [
  {
    key: "polyglot",
    weight: 40,
    make: (pick) =>
      `${POLY_STEM[pick("poly-stem", POLY_STEM.length)]!}${POLY_END[pick("poly-end", POLY_END.length)]!}`,
  },
  {
    key: "anglic",
    weight: 20,
    make: (pick) =>
      `${ANGLIC_HEAD[pick("head", ANGLIC_HEAD.length)]!}${ANGLIC_TAIL[pick("tail", ANGLIC_TAIL.length)]!}`,
  },
  {
    key: "vilani",
    weight: 18,
    make: (pick) =>
      `${VILANI_HEAD[pick("vil-head", VILANI_HEAD.length)]!}${VILANI_TAIL[pick("vil-tail", VILANI_TAIL.length)]!}`,
  },
  {
    key: "founder",
    weight: 14,
    make: (pick) => {
      const who = FOUNDERS[pick("founder", FOUNDERS.length)]!;
      const place = FOUNDER_PLACE[pick("founder-place", FOUNDER_PLACE.length)]!;
      return pick("founder-poss", 2) === 0 ? `${who}'s ${place}` : `${who} ${place}`;
    },
  },
  {
    key: "functional",
    weight: 8,
    make: (pick, rank) => {
      // The word is the world's, drawn once; the number is the settlement's.
      const word = FUNCTIONAL[pick("func-word", FUNCTIONAL.length, 0)]!;
      return `${word} ${NUMERALS[Math.min(rank, NUMERALS.length - 1)]!}`;
    },
    /**
     * A world, rather than a town on one. SubSectorSpec 3.4.3.
     *
     * "Camp One" is a good name for the first camp on a world and a poor name
     * for a world: there are eight functional words, so a subsector whose region
     * named things this way had forty worlds drawing from eight names and the
     * same four turned up in every subsector of a sector. A world takes the
     * word after a name of its own - Vlanar Depot, Kadrin Station - which is
     * how a working world is actually named and is four thousand eight hundred
     * names rather than eight.
     */
    world: (pick) => {
      const stem = POLY_STEM[pick("func-stem", POLY_STEM.length, 0)]!;
      const end = POLY_END[pick("func-end", POLY_END.length, 0)]!;
      const word = FUNCTIONAL[pick("func-word", FUNCTIONAL.length, 0)]!;
      return `${stem}${end} ${word}`;
    },
  },
];

/** Which way this world names its places. Fixed by the seed, as everything is. */
export function flavourFor(seed: string): Flavour {
  const total = FLAVOURS.reduce((sum, f) => sum + f.weight, 0);
  let at = valueFor(`${seed}:settle:flavour`, 0) * total;
  for (const flavour of FLAVOURS) {
    at -= flavour.weight;
    if (at < 0) return flavour;
  }
  return FLAVOURS[0]!;
}

/**
 * The names for a world's settlements, in rank order.
 *
 * Generated together rather than one at a time so that a collision can be dealt
 * with. Two of the draws landing on the same pair is unlikely and not impossible,
 * and two places on one world with one name between them is worse than a name
 * drawn a second time: the rank is shifted and the draw made again.
 */
export function settlementNames(
  seed: string,
  count: number,
  /**
   * The way these names are made, where the caller has one in mind. A subsector
   * hands its own flavour to most of its worlds under SubSectorSpec 3.4.2, so a
   * region sounds like one; left out, a seed picks its own.
   */
  flavour: Flavour = flavourFor(seed),
): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  for (let rank = 0; rank < count; rank++) {
    let name = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      name = nameAt(seed, flavour, rank, attempt);
      if (!used.has(name)) break;
    }
    used.add(name);
    out.push(name);
  }
  return out;
}

/**
 * The name of a world. SubSectorSpec 3.4.
 *
 * A world is not a settlement, and one flavour names the two differently. The
 * attempt shifts every draw at once, so a subsector that finds it has drawn the same
 * name twice can ask for another.
 */
export function worldNameFor(seed: string, flavour: Flavour, attempt = 0): string {
  const shift = attempt * 1013;
  const pick: Pick = (stream, count, index = 0) => {
    const value = valueFor(`${seed}:settle:${stream}`, index + shift);
    return Math.min(count - 1, Math.floor(value * count));
  };
  return flavour.world === undefined ? flavour.make(pick, 0) : flavour.world(pick);
}

/** One name. `attempt` shifts every draw at once, so a retry is a fresh name. */
function nameAt(seed: string, flavour: Flavour, rank: number, attempt: number): string {
  const shift = attempt * 1013;
  const pick: Pick = (stream, count, index = rank) => {
    const value = valueFor(`${seed}:settle:${stream}`, index + shift);
    return Math.min(count - 1, Math.floor(value * count));
  };
  return flavour.make(pick, rank);
}

/**
 * The line a settlement's narrative starts with. Spec 6.24.4: the profile knows
 * how many people a world holds and nothing on the map said where they were, so
 * each settlement says what it is carrying.
 *
 * As prose rather than to the person. A figure worked out from one digit of a
 * profile by a rank-size rule is good to about its first two characters, and
 * writing it to the last one would be claiming a census nobody took.
 */
export function populationNote(people: number): string {
  if (people <= 0) return "A settlement of no recorded population.";
  return `Population about ${compactNumber(people)}.`;
}

/* How far a settlement reaches -------------------------------------------- */

/**
 * How far out a settlement is built, and how the ground thins from its middle to
 * its edge. Spec 5.9.
 *
 * Read by the local panel of 4.5 and by nothing else, because of its scale. A hex
 * of the map is a couple of hundred kilometres across and some sixty thousand
 * square kilometres of ground; the largest built-up area on Earth is an eighth of
 * that, so a hex holding a city is still overwhelmingly whatever 5.8 says it is.
 * A local hex is a couple of hundred square kilometres and a city covers dozens of
 * them, which is where the question starts being worth asking.
 *
 * What the panel makes of it is 5.9.4's business: two lines, cut from this by the
 * contour tracer of 4.5.8. Nothing here draws anything.
 */

/**
 * People to the square kilometre of built-up area. Earth's dense cities run
 * between two and ten thousand; the higher end is taken, since a world building
 * upwards holds more of them on the same footprint than one that is not.
 */
const URBAN_DENSITY = 8000;

/** The fraction of the radius that is solidly built before it starts thinning
 *  into suburb, ribbon and then open country. */
const URBAN_CORE = 0.45;

/** How far a settlement of this many people is built out, in kilometres. */
export function builtRadiusKm(people: number): number {
  if (people <= 0) return 0;
  return Math.sqrt(people / URBAN_DENSITY / Math.PI);
}

/**
 * How built up a place is, from its distance to a settlement and that
 * settlement's reach. One at the middle, nothing at the edge, and a shoulder
 * between, so the limits cut from it fall where the town thins rather than at a
 * ring drawn round it.
 */
export function builtAt(distanceKm: number, radiusKm: number): number {
  if (radiusKm <= 0 || distanceKm >= radiusKm) return 0;
  const t = (radiusKm - distanceKm) / (radiusKm * (1 - URBAN_CORE));
  return t >= 1 ? 1 : t * t * (3 - 2 * t);
}
