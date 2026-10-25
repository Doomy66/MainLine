/**
 * What a published sector carries besides its worlds. AppSpec 8.8.
 *
 * Borders, the express network, and what each allegiance code is called. None
 * of it can be worked out from the worlds: a border claims empty hexes that no
 * world marks, the real express routes are a chosen few legs rather than every
 * pair of good ports, and `ImDd` only means the Domain of Deneb because a
 * table somewhere says so.
 *
 * So it is carried on the document, the way the worlds are, and a saved sector
 * draws its borders without going back to the network.
 *
 * Its own file so the documents, the reader and the map can all name these
 * without importing each other.
 */

export interface BorderPath {
  /** Whose border it is, as an allegiance code. */
  readonly allegiance: string;
  /** What the data calls it, where it says. */
  readonly label: string;
  /** Where the label belongs, as a hex, where the data says. */
  readonly labelAt: string;
  /** The ring of hexes along the inside of the boundary. */
  readonly hexes: readonly string[];
}

/** One leg of the express network, between two hexes of this sector. */
export interface RouteLeg {
  readonly from: string;
  readonly to: string;
}

export interface AllegianceName {
  readonly code: string;
  readonly name: string;
  /** The short form, for a label that has to fit on a map. */
  readonly short: string;
}

export interface ChartedMap {
  readonly borders: readonly BorderPath[];
  readonly routes: readonly RouteLeg[];
  readonly allegiances: readonly AllegianceName[];
}

export const NOTHING_CHARTED: ChartedMap = { borders: [], routes: [], allegiances: [] };

/** Whether there is anything here worth carrying. */
export function chartedIsEmpty(map: ChartedMap): boolean {
  return map.borders.length === 0 && map.routes.length === 0 && map.allegiances.length === 0;
}

/** What an allegiance code is called, or the code itself where nothing says. */
export function nameOfAllegiance(map: ChartedMap, code: string): string {
  const held = map.allegiances.find((one) => one.code === code);
  if (held === undefined) return code;
  return held.short.trim() !== "" && held.short !== "NA" ? held.short : held.name;
}

/**
 * Read back from a saved document, defensively and never fatally.
 *
 * A document whose borders are damaged is still a document full of worlds, and
 * losing the worlds to save the decoration would be the wrong way round.
 */
export function parseChartedMap(raw: unknown): ChartedMap | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const map: ChartedMap = {
    borders: parseBorders(r["borders"]),
    routes: parseRoutes(r["routes"]),
    allegiances: parseAllegiances(r["allegiances"]),
  };
  return chartedIsEmpty(map) ? undefined : map;
}

function word(r: Record<string, unknown>, key: string): string {
  return typeof r[key] === "string" ? (r[key] as string) : "";
}

function parseBorders(raw: unknown): BorderPath[] {
  if (!Array.isArray(raw)) return [];
  const out: BorderPath[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const hexes = Array.isArray(r["hexes"])
      ? r["hexes"].filter((one): one is string => typeof one === "string")
      : [];
    if (hexes.length < 3) continue;
    out.push({
      allegiance: word(r, "allegiance"),
      label: word(r, "label"),
      labelAt: word(r, "labelAt"),
      hexes,
    });
  }
  return out;
}

function parseRoutes(raw: unknown): RouteLeg[] {
  if (!Array.isArray(raw)) return [];
  const out: RouteLeg[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const from = word(r, "from");
    const to = word(r, "to");
    if (from === "" || to === "") continue;
    out.push({ from, to });
  }
  return out;
}

function parseAllegiances(raw: unknown): AllegianceName[] {
  if (!Array.isArray(raw)) return [];
  const out: AllegianceName[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const code = word(r, "code");
    if (code === "") continue;
    out.push({ code, name: word(r, "name"), short: word(r, "short") });
  }
  return out;
}
