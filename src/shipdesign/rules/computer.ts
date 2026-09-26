/**
 * Step 6, Install Computer. High Guard Update 2022, PDF page 21. ShipSpec 4.7.
 */

export interface ComputerRule {
  readonly label: string;
  /** Processing, which is the bandwidth it can run. */
  readonly processing: number;
  readonly tl: number;
  /** MCr. */
  readonly cost: number;
  /** A core includes Jump Control and its processing is on top of what that needs. Page 21. */
  readonly core: boolean;
}

/** Computers table, page 21. Keyed by processing. ShipSpec 4.7.1. */
export const COMPUTERS: readonly ComputerRule[] = [
  { label: "Computer/5", processing: 5, tl: 7, cost: 0.03, core: false },
  { label: "Computer/10", processing: 10, tl: 9, cost: 0.16, core: false },
  { label: "Computer/15", processing: 15, tl: 11, cost: 2, core: false },
  { label: "Computer/20", processing: 20, tl: 12, cost: 5, core: false },
  { label: "Computer/25", processing: 25, tl: 13, cost: 10, core: false },
  { label: "Computer/30", processing: 30, tl: 14, cost: 20, core: false },
  { label: "Computer/35", processing: 35, tl: 15, cost: 30, core: false },
  { label: "Core/40", processing: 40, tl: 9, cost: 45, core: true },
  { label: "Core/50", processing: 50, tl: 10, cost: 60, core: true },
  { label: "Core/60", processing: 60, tl: 11, cost: 75, core: true },
  { label: "Core/70", processing: 70, tl: 12, cost: 80, core: true },
  { label: "Core/80", processing: 80, tl: 13, cost: 95, core: true },
  { label: "Core/90", processing: 90, tl: 14, cost: 120, core: true },
  { label: "Core/100", processing: 100, tl: 15, cost: 130, core: true },
];

/** Computer Options, page 21. ShipSpec 4.7.2. */
export const JUMP_CONTROL_SPECIALISATION = { suffix: "bis", extraJumpProcessing: 5, costFactor: 0.5 } as const;
export const HARDENED_SYSTEMS = { suffix: "fib", costFactor: 0.5 } as const;

export function computerRule(processing: number, core: boolean): ComputerRule | undefined {
  return COMPUTERS.find((row) => row.processing === processing && row.core === core);
}
