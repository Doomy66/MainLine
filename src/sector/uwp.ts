/**
 * The Universal World Profile: starport, size, atmosphere, hydrographics,
 * population, government, law level and tech level, as eight extended-hex
 * digits with a dash before the last.
 */

export interface Uwp {
  readonly starport: string;
  readonly size: number;
  readonly atmosphere: number;
  readonly hydrographics: number;
  readonly population: number;
  readonly government: number;
  readonly law: number;
  readonly tl: number;
}

/** Extended hex, which skips I and O so they cannot be read as 1 and 0. */
const EHEX = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function ehex(digit: string): number {
  const at = EHEX.indexOf(digit.toUpperCase());
  return at < 0 ? 0 : at;
}

export function toEhex(value: number): string {
  return EHEX[Math.max(0, Math.min(EHEX.length - 1, Math.round(value)))]!;
}

/** "A788899-C" to its eight values. Anything unreadable reads as zero. */
export function parseUwp(text: string): Uwp {
  const t = text.trim().toUpperCase().replace("-", "");
  const at = (i: number) => ehex(t[i] ?? "0");
  return {
    starport: /[ABCDEX]/.test(t[0] ?? "") ? t[0]! : "X",
    size: at(1),
    atmosphere: at(2),
    hydrographics: at(3),
    population: at(4),
    government: at(5),
    law: at(6),
    tl: at(7),
  };
}

export const STARPORTS: Readonly<Record<string, string>> = {
  A: "Excellent: refined fuel, shipyard for starships, overhaul",
  B: "Good: refined fuel, shipyard for non-jump spacecraft, overhaul",
  C: "Routine: unrefined fuel, small craft yard, repairs",
  D: "Poor: unrefined fuel, limited repairs",
  E: "Frontier: a landing beacon and nothing else",
  X: "No starport",
};

const ATMOSPHERES = [
  "None", "Trace", "Very thin, tainted", "Very thin", "Thin, tainted", "Thin", "Standard",
  "Standard, tainted", "Dense", "Dense, tainted", "Exotic", "Corrosive", "Insidious",
  "Very dense", "Low", "Unusual",
];

const GOVERNMENTS = [
  "None", "Company/corporation", "Participating democracy", "Self-perpetuating oligarchy",
  "Representative democracy", "Feudal technocracy", "Captive government", "Balkanisation",
  "Civil service bureaucracy", "Impersonal bureaucracy", "Charismatic dictator",
  "Non-charismatic leader", "Charismatic oligarchy", "Religious dictatorship",
  "Religious autocracy", "Totalitarian oligarchy",
];

export function describeAtmosphere(code: number): string {
  return ATMOSPHERES[code] ?? "Unusual";
}

export function describeGovernment(code: number): string {
  return GOVERNMENTS[code] ?? "Other";
}

/** People on the world, in words: population digit P means about 10^P. */
export function describePopulation(code: number): string {
  if (code === 0) return "Uninhabited";
  if (code >= 12) return `${Math.pow(10, code - 12)} trillion`;
  if (code >= 9) return `${Math.pow(10, code - 9)} billion`;
  if (code >= 6) return `${Math.pow(10, code - 6)} million`;
  if (code >= 3) return `${Math.pow(10, code - 3)} thousand`;
  return `${Math.pow(10, code)}`;
}

export function describeSize(code: number): string {
  if (code === 0) return "Asteroid belt";
  return `${(code * 1600).toLocaleString()} km`;
}

export function describeHydrographics(code: number): string {
  if (code === 0) return "Desert";
  if (code >= 10) return "Water world";
  return `${code * 10}% water`;
}
