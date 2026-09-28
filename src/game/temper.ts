/**
 * A computer Empire's character: four numbers, each from 0 to 1, that its
 * admirals go by. They start from its personality, and differ a little from
 * one Empire to the next, so no two cautious Empires are quite alike.
 */

import { Rng } from "./rng";
import type { Personality, StandingOrders, Temper } from "./types";

const BASE: Readonly<Record<Personality, Temper>> = {
  aggressive: { aggression: 0.8, resolve: 0.7, expansion: 0.4, caution: 0.2 },
  expansionist: { aggression: 0.5, resolve: 0.5, expansion: 0.85, caution: 0.35 },
  cautious: { aggression: 0.2, resolve: 0.35, expansion: 0.45, caution: 0.75 },
};

const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;

/** A character for a new Empire of a personality, varied by the dice. */
export function temperFor(personality: Personality, rng: Rng): Temper {
  const b = BASE[personality];
  const vary = (n: number) => clamp(n + (rng.next() - 0.5) * 0.3);
  return { aggression: vary(b.aggression), resolve: vary(b.resolve), expansion: vary(b.expansion), caution: vary(b.caution) };
}

/** The same character every time for an Empire from a game saved before characters: seeded by its id. */
export function temperFromId(personality: Personality, id: string): Temper {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return temperFor(personality, new Rng(h | 0));
}

/** The odds, own strength to theirs, an Empire wants before it goes to take a world. */
export function oddsWanted(t: Temper): number {
  return 2.2 - 1.2 * t.aggression;
}

/** The odds it wants to press an attack where its fleet already is. */
export function nerve(t: Temper): number {
  return 1.45 - 0.45 * t.aggression;
}

/** The share of hull left at which its fleets break off. */
export function withdrawAt(t: Temper): number {
  return Math.round((0.6 - 0.45 * t.resolve) * 100) / 100;
}

/** The share of its strength it keeps guarding the capital. */
export function guardShare(t: Temper): number {
  return 0.1 + 0.35 * t.caution;
}

/** How much more than its worth an independent world, and a rival's, is to it. */
export function prize(t: Temper, rival: boolean): number {
  return rival ? 1 + 0.8 * t.aggression : 1 + 0.8 * t.expansion;
}

/**
 * Standing orders for a fleet on its way somewhere: a bold Empire fights
 * whatever it meets, a wary one only what it can beat; none of them chases
 * ships across a system it is passing through.
 */
export function travelOrders(t: Temper, base: StandingOrders): StandingOrders {
  return { ...base, engage: t.aggression >= 0.6 ? "any" : "weaker", intercept: false, withdrawAt: withdrawAt(t) };
}

/** An Empire's character in a few words, for the standings. */
export function describeTemper(t: Temper): string {
  const words = [
    t.aggression >= 0.65 ? "bold" : t.aggression <= 0.35 ? "wary" : "",
    t.resolve >= 0.65 ? "stubborn" : t.resolve <= 0.35 ? "quick to retreat" : "",
    t.expansion >= 0.7 ? "land-hungry" : "",
    t.caution >= 0.6 ? "guards its capital" : "",
  ].filter((w) => w !== "");
  return words.length === 0 ? "steady" : words.join(", ");
}
