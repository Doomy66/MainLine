import { describe, expect, it } from "vitest";
import { forecast, shares, work, type Job } from "./yard";

const job = (w: number, placed: number, modular: boolean, idleUntil = 0): Job => ({ work: w, worked: 0, placed, modular, idleUntil });

describe("a yard's slips", () => {
  it("give every ship a slip in order, then the spare ones to the big ships", () => {
    const jobs = [job(90, 0, true), job(30, 0, false)];
    expect(shares(jobs, 3, 1)).toEqual([2, 1]);
    expect(shares([job(30, 0, false)], 3, 1)).toEqual([1]);
    // Ordered today: nothing until tomorrow.
    expect(shares([job(30, 1, false)], 3, 1)).toEqual([0]);
    // More ships than slips: the last waits.
    expect(shares([job(9, 0, true), job(9, 0, true), job(9, 0, true), job(9, 0, false)], 3, 1)).toEqual([1, 1, 1, 0]);
  });

  it("forecast a big ship sooner when a slip comes free, and the forecast comes true", () => {
    const jobs = [job(90, 0, true), job(20, 0, false)];
    const plan = forecast(jobs, 3, 0);
    // Two slips for 20 days (40 done), then three for the other 50: 17 more days.
    expect(plan[1]).toEqual({ start: 0, done: 20 });
    expect(plan[0]).toEqual({ start: 0, done: 37 });
    let day = 0;
    while (jobs[0]!.worked < jobs[0]!.work) work(jobs, 3, ++day);
    expect(day).toBe(37);
  });

  it("hold a slip for a faction in disorder, but do no work on it", () => {
    const jobs = [job(10, 0, true, 5)];
    work(jobs, 3, 3);
    expect(jobs[0]!.worked).toBe(0);
    expect(forecast(jobs, 3, 3)[0]!.done).toBe(8);
  });
});
