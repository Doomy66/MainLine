/**
 * Software. The basic packages from the Traveller Core Rulebook Update 2022,
 * page 161, which High Guard defers to (PDF page 74), and the High Guard
 * packages from PDF pages 74-76. ShipSpec 4.7.4.
 */

export interface SoftwareRule {
  readonly label: string;
  readonly tl: number;
  readonly bandwidth: number;
  /** MCr. Zero where the book says Included. */
  readonly cost: number;
  readonly source: "core" | "highGuard";
  /** Jump Control is the one package a /bis computer and a core treat specially. */
  readonly jumpControl?: number;
}

export type SoftwarePackage =
  | "manoeuvre"
  | "intellect"
  | "library"
  | "jumpControl"
  | "evade"
  | "fireControl"
  | "autoRepair"
  | "advancedFireControl"
  | "antiHijack"
  | "battleNetwork"
  | "battleSystem"
  | "broadSpectrumEw"
  | "consciousIntelligence"
  | "electronicWarfare"
  | "launchSolution"
  | "pointDefence"
  | "screenOptimiser"
  | "virtualCrew"
  | "virtualGunner";

/** A package with levels lists one rule per level, in level order starting at LEVEL_START. */
export interface SoftwareFamily {
  readonly label: string;
  /** The level the first entry in `levels` has: 1 for most, 0 for Virtual Crew and Virtual Gunner. */
  readonly firstLevel: number;
  readonly levels: readonly SoftwareRule[];
}

/** Core page 161. Library has no row of its own; every High Guard ship sheet shows it at no cost. */
export const SOFTWARE: Readonly<Record<SoftwarePackage, SoftwareFamily>> = {
  manoeuvre: { label: "Manoeuvre", firstLevel: 0, levels: [{ label: "Manoeuvre", tl: 8, bandwidth: 0, cost: 0, source: "core" }] },
  intellect: { label: "Intellect", firstLevel: 0, levels: [{ label: "Intellect", tl: 11, bandwidth: 0, cost: 0, source: "core" }] },
  library: { label: "Library", firstLevel: 0, levels: [{ label: "Library", tl: 8, bandwidth: 0, cost: 0, source: "core" }] },
  jumpControl: {
    label: "Jump Control", firstLevel: 1,
    levels: [
      { label: "Jump Control/1", tl: 9, bandwidth: 5, cost: 0.1, source: "core", jumpControl: 1 },
      { label: "Jump Control/2", tl: 11, bandwidth: 10, cost: 0.2, source: "core", jumpControl: 2 },
      { label: "Jump Control/3", tl: 12, bandwidth: 15, cost: 0.3, source: "core", jumpControl: 3 },
      { label: "Jump Control/4", tl: 13, bandwidth: 20, cost: 0.4, source: "core", jumpControl: 4 },
      { label: "Jump Control/5", tl: 14, bandwidth: 25, cost: 0.5, source: "core", jumpControl: 5 },
      { label: "Jump Control/6", tl: 15, bandwidth: 30, cost: 0.6, source: "core", jumpControl: 6 },
    ],
  },
  evade: {
    label: "Evade", firstLevel: 1,
    levels: [
      { label: "Evade/1", tl: 9, bandwidth: 10, cost: 1, source: "core" },
      { label: "Evade/2", tl: 11, bandwidth: 15, cost: 2, source: "core" },
      { label: "Evade/3", tl: 13, bandwidth: 25, cost: 3, source: "core" },
    ],
  },
  fireControl: {
    label: "Fire Control", firstLevel: 1,
    levels: [
      { label: "Fire Control/1", tl: 9, bandwidth: 5, cost: 2, source: "core" },
      { label: "Fire Control/2", tl: 10, bandwidth: 10, cost: 4, source: "core" },
      { label: "Fire Control/3", tl: 11, bandwidth: 15, cost: 6, source: "core" },
      { label: "Fire Control/4", tl: 12, bandwidth: 20, cost: 8, source: "core" },
      { label: "Fire Control/5", tl: 13, bandwidth: 25, cost: 10, source: "core" },
    ],
  },
  autoRepair: {
    label: "Auto-Repair", firstLevel: 1,
    levels: [
      { label: "Auto-Repair/1", tl: 10, bandwidth: 10, cost: 5, source: "core" },
      { label: "Auto-Repair/2", tl: 12, bandwidth: 20, cost: 10, source: "core" },
    ],
  },
  advancedFireControl: {
    label: "Advanced Fire Control", firstLevel: 1,
    levels: [
      { label: "Advanced Fire Control/1", tl: 10, bandwidth: 15, cost: 12, source: "highGuard" },
      { label: "Advanced Fire Control/2", tl: 12, bandwidth: 25, cost: 15, source: "highGuard" },
      { label: "Advanced Fire Control/3", tl: 14, bandwidth: 30, cost: 18, source: "highGuard" },
    ],
  },
  antiHijack: {
    label: "Anti-Hijack", firstLevel: 1,
    levels: [
      { label: "Anti-Hijack/1", tl: 11, bandwidth: 2, cost: 6, source: "highGuard" },
      { label: "Anti-Hijack/2", tl: 12, bandwidth: 10, cost: 8, source: "highGuard" },
      { label: "Anti-Hijack/3", tl: 13, bandwidth: 15, cost: 10, source: "highGuard" },
    ],
  },
  battleNetwork: {
    label: "Battle Network", firstLevel: 1,
    levels: [
      { label: "Battle Network/1", tl: 12, bandwidth: 5, cost: 5, source: "highGuard" },
      { label: "Battle Network/2", tl: 14, bandwidth: 10, cost: 10, source: "highGuard" },
    ],
  },
  battleSystem: {
    label: "Battle System", firstLevel: 1,
    levels: [
      { label: "Battle System/1", tl: 9, bandwidth: 5, cost: 18, source: "highGuard" },
      { label: "Battle System/2", tl: 12, bandwidth: 10, cost: 24, source: "highGuard" },
      { label: "Battle System/3", tl: 15, bandwidth: 15, cost: 36, source: "highGuard" },
    ],
  },
  broadSpectrumEw: {
    label: "Broad Spectrum EW", firstLevel: 0,
    levels: [{ label: "Broad Spectrum EW", tl: 13, bandwidth: 12, cost: 14, source: "highGuard" }],
  },
  consciousIntelligence: {
    label: "Conscious Intelligence", firstLevel: 1,
    levels: [
      { label: "Conscious Intelligence/1", tl: 16, bandwidth: 40, cost: 25, source: "highGuard" },
      { label: "Conscious Intelligence/2", tl: 17, bandwidth: 25, cost: 20, source: "highGuard" },
      { label: "Conscious Intelligence/3", tl: 18, bandwidth: 10, cost: 15, source: "highGuard" },
    ],
  },
  electronicWarfare: {
    label: "Electronic Warfare", firstLevel: 1,
    levels: [
      { label: "Electronic Warfare/1", tl: 10, bandwidth: 10, cost: 15, source: "highGuard" },
      { label: "Electronic Warfare/2", tl: 13, bandwidth: 15, cost: 18, source: "highGuard" },
      { label: "Electronic Warfare/3", tl: 15, bandwidth: 20, cost: 24, source: "highGuard" },
    ],
  },
  launchSolution: {
    label: "Launch Solution", firstLevel: 1,
    levels: [
      { label: "Launch Solution/1", tl: 8, bandwidth: 5, cost: 10, source: "highGuard" },
      { label: "Launch Solution/2", tl: 10, bandwidth: 10, cost: 12, source: "highGuard" },
      { label: "Launch Solution/3", tl: 12, bandwidth: 15, cost: 16, source: "highGuard" },
    ],
  },
  pointDefence: {
    label: "Point Defence", firstLevel: 1,
    levels: [
      { label: "Point Defence/1", tl: 9, bandwidth: 12, cost: 8, source: "highGuard" },
      { label: "Point Defence/2", tl: 12, bandwidth: 15, cost: 12, source: "highGuard" },
    ],
  },
  screenOptimiser: {
    label: "Screen Optimiser", firstLevel: 0,
    levels: [{ label: "Screen Optimiser", tl: 10, bandwidth: 10, cost: 5, source: "highGuard" }],
  },
  virtualCrew: {
    label: "Virtual Crew", firstLevel: 0,
    levels: [
      { label: "Virtual Crew/0", tl: 10, bandwidth: 5, cost: 1, source: "highGuard" },
      { label: "Virtual Crew/1", tl: 13, bandwidth: 10, cost: 5, source: "highGuard" },
      { label: "Virtual Crew/2", tl: 15, bandwidth: 15, cost: 10, source: "highGuard" },
    ],
  },
  virtualGunner: {
    label: "Virtual Gunner", firstLevel: 0,
    levels: [
      { label: "Virtual Gunner/0", tl: 9, bandwidth: 5, cost: 1, source: "highGuard" },
      { label: "Virtual Gunner/1", tl: 12, bandwidth: 10, cost: 5, source: "highGuard" },
      { label: "Virtual Gunner/2", tl: 15, bandwidth: 15, cost: 10, source: "highGuard" },
    ],
  },
};

/** Synchronised jumps need this much more Jump Control bandwidth. Page 16. */
export const SYNCHRONISED_JUMP_EXTRA_BANDWIDTH = 5;

/** The rule for a package at a level, or undefined where the book has no such row. */
export function softwareRule(pkg: SoftwarePackage, level = 0): SoftwareRule | undefined {
  const family = SOFTWARE[pkg];
  return family.levels[level - family.firstLevel];
}
