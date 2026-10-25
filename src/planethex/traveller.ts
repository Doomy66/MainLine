/**
 * The imperial date, and the arithmetic that turns one into a number of days.
 * SystemSpec 3.5.
 *
 * Traveller writes a date as a day of the year and a year - 001-1105 is the
 * first day of 1105 - and its calendar is a flat 365 days with no leap and no
 * months. That is the whole of it, and it is why this file is short: there is
 * nothing here about weeks, nothing about which day of them it is, and nothing
 * that needs a timezone.
 *
 * What the date is for is section 3.5: the angles of the bodies in a system. It
 * reaches nothing else. A planet's climate is averaged over a whole year under
 * the planet spec 5.7.3.2, so no world here has a season for a date to fall in.
 */

/** Days in an imperial year. Flat, with no leap: Traveller's own calendar. */
export const DAYS_IN_YEAR = 365;

export interface ImperialDate {
  /** 1 to DAYS_IN_YEAR. */
  readonly day: number;
  /** 0 to 9999, which is as many digits as the format has room for. */
  readonly year: number;
}

/**
 * Where the count starts, and what a document with no date in it means.
 *
 * 001-1105 is Traveller's own present, and using it for both is what keeps
 * every system already drawn exactly where it was: at the epoch the turn of
 * 3.5.2 is nothing, so a body sits at the angle its seed gave it and no save
 * written before there were dates moves an inch.
 */
export const EPOCH: ImperialDate = { day: 1, year: 1105 };

/**
 * Reads a date, or null if it is not one. Spaces are allowed around it and the
 * day may be written short, so " 1-1105 " and "001-1105" are the same date;
 * the day itself has to be a real one, since day 000 and day 366 are not.
 */
export function parseImperialDate(text: string): ImperialDate | null {
  const match = /^(\d{1,3})-(\d{1,4})$/.exec(text.replace(/\s+/g, ""));
  if (match === null) return null;
  const day = Number(match[1]);
  const year = Number(match[2]);
  if (day < 1 || day > DAYS_IN_YEAR) return null;
  return { day, year };
}

/** The canonical form, so day 1 of 1105 writes itself as 001-1105. */
export function formatImperialDate(date: ImperialDate): string {
  return `${String(date.day).padStart(3, "0")}-${String(date.year).padStart(4, "0")}`;
}

/**
 * How many days a date is from the epoch. Negative before it, which is allowed:
 * a referee running a campaign in 1080 is running one in 1080.
 */
export function dayFromEpoch(date: ImperialDate): number {
  return (date.year - EPOCH.year) * DAYS_IN_YEAR + (date.day - EPOCH.day);
}

/**
 * The date a document holds, or the epoch where it holds nothing readable.
 *
 * A save written before there were dates has none, and the epoch is what it was
 * drawn at, so it opens showing what it showed. AppSpec 4.1 in miniature: a
 * field that was not there reads as the value it always had.
 */
export function dateOrEpoch(text: unknown): ImperialDate {
  if (typeof text !== "string") return EPOCH;
  return parseImperialDate(text) ?? EPOCH;
}
