/**
 * Saving a game: the whole state as JSON, into the browser for carrying on and
 * into a `.game` file for keeping or handing on. The sector and every ship
 * design travel inside it, so a file opens anywhere.
 */

import { Game } from "./game";
import type { GameState } from "./types";

export const EXTENSION = ".game";
const AUTOSAVE_KEY = "mainline.autosave";

export function serialise(game: Game): string {
  return `${JSON.stringify(game.snapshot(), null, 1)}\n`;
}

export function parseGame(text: string): Game {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const s = raw as Partial<GameState>;
  if (typeof s !== "object" || s === null || s.version !== 1 || !Array.isArray(s.factions) || s.sector === undefined) {
    throw new Error("That file is not a Mainline game.");
  }
  return new Game(s as GameState);
}

export function autosave(game: Game): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serialise(game));
  } catch {
    // A full or blocked store costs the autosave, not the game.
  }
}

export function loadAutosave(): Game | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text === null ? null : parseGame(text);
  } catch {
    return null;
  }
}

/** A line describing the autosave, for the title screen, or null where there is none. */
export function download(game: Game): void {
  const blob = new Blob([serialise(game)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${game.state.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "Mainline"} day ${game.state.day}${EXTENSION}`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Ask for a file and read it as text. */
export function chooseFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        resolve(file === undefined ? null : { name: file.name, text: await file.text() });
      },
      { once: true },
    );
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}
