/**
 * Where a document came from, when it did not come from here. AppSpec 8.4.
 *
 * A sector or subsector this application rolled needs no provenance: its seed
 * is its provenance, and the whole of it follows from that. One read in from
 * somewhere else does need it, for three reasons. Somebody opening the file in
 * a year's time should be able to tell canon from invention. The export should
 * credit the people whose work it is. And the data belongs to Mongoose
 * Publishing and is in the document for the user's own use, which is a thing
 * worth saying once in the file rather than nowhere.
 *
 * Its own file so that the documents and the importer can all name the type
 * without importing each other.
 */

/** Which sector was read in, and from where. */
export interface ChartedSource {
  readonly origin: "travellermap";
  /** The sector's published name. */
  readonly sector: string;
  /** The four letters its data is addressed by, such as "Spin". */
  readonly abbreviation: string;
  /** Where it sits in charted space. The seed is keyed on this. */
  readonly x: number;
  readonly y: number;
  /** Which era of the setting, as travellermap names them. */
  readonly milieu: string;
}

/**
 * The provenance a saved document carries, or undefined where it has none.
 *
 * Read defensively and never fatally. A document whose provenance is damaged
 * is still a document full of worlds, and losing the worlds to save the
 * footnote would be the wrong way round.
 */
export function parseSource(raw: unknown): ChartedSource | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r["origin"] !== "travellermap") return undefined;
  const word = (key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
  const place = (key: string) =>
    typeof r[key] === "number" && Number.isFinite(r[key]) ? (r[key] as number) : 0;
  const abbreviation = word("abbreviation");
  if (abbreviation === "") return undefined;
  return {
    origin: "travellermap",
    sector: word("sector"),
    abbreviation,
    x: place("x"),
    y: place("y"),
    milieu: word("milieu"),
  };
}

/** How a document says where it came from, in one line. */
export function describeSource(source: ChartedSource): string {
  const era = source.milieu === "" ? "" : ` at ${source.milieu}`;
  return `${source.sector}${era}, from The Traveller Map`;
}
