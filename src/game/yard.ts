/**
 * A yard's slips, day by day. Every ship on order gets a slip in the order
 * they were placed; slips left over go to the big ships already on the slips,
 * built in modules on several at once. So a big ship finishes sooner whenever
 * a slip comes free, and later when a new order takes one back.
 */

/** A ship on order at a yard, as the slips see it. */
export interface Job {
  /** Slip-days of work she needs: her days on one slip. */
  readonly work: number;
  /** Slip-days done. */
  worked: number;
  /** The day she was ordered; work starts the day after. */
  readonly placed: number;
  /** Big enough to be built in modules on more than one slip. */
  readonly modular: boolean;
  /** Her faction is in disorder until this day: she keeps her slip but nothing moves. */
  readonly idleUntil: number;
}

/**
 * Slips each job has on day `day`, jobs in the order placed: one each while
 * they last, then the spare ones to modular jobs on the slips, a slip at a time
 * in turn.
 */
export function shares(jobs: readonly Job[], slips: number, day: number): number[] {
  const out = jobs.map(() => 0);
  let left = slips;
  const ready = jobs.flatMap((j, i) => (j.placed < day && j.worked < j.work ? [i] : []));
  for (const i of ready) {
    if (left === 0) break;
    out[i] = 1;
    left--;
  }
  let gave = true;
  while (left > 0 && gave) {
    gave = false;
    for (const i of ready) {
      if (left === 0) break;
      const j = jobs[i]!;
      if (out[i] === 0 || !j.modular || j.idleUntil > day || j.worked + out[i]! >= j.work) continue;
      out[i]!++;
      left--;
      gave = true;
    }
  }
  return out;
}

/** A day's work at a yard. */
export function work(jobs: readonly Job[], slips: number, day: number): void {
  const s = shares(jobs, slips, day);
  jobs.forEach((j, i) => {
    if (s[i]! > 0 && !(j.idleUntil > day)) j.worked = Math.min(j.work, j.worked + s[i]!);
  });
}

/**
 * When each job would start and finish if nothing more were ordered: the day
 * she first has a slip (work on it is done the next day), and the day she is
 * done.
 */
export function forecast(jobs: readonly Job[], slips: number, today: number): { start: number; done: number }[] {
  const sim = jobs.map((j) => ({ ...j }));
  const out = jobs.map((j) => ({ start: j.worked > 0 ? today : -1, done: j.worked >= j.work ? today : -1 }));
  if (slips === 0) return jobs.map((j) => ({ start: today, done: today + j.work - j.worked }));
  for (let day = today + 1; out.some((o) => o.done < 0); day++) {
    const s = shares(sim, slips, day);
    sim.forEach((j, i) => {
      const o = out[i]!;
      if (o.done >= 0 || s[i] === 0) return;
      if (o.start < 0) o.start = day - 1;
      if (!(j.idleUntil > day)) j.worked += s[i]!;
      if (j.worked >= j.work) o.done = day;
    });
  }
  return out;
}
