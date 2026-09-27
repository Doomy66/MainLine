/**
 * Saving a game: the whole state as JSON, into the browser for carrying on and
 * into a `.game` file for keeping or handing on. The sector and every ship
 * design travel inside it, so a file opens anywhere.
 */

import { bundledDesigns } from "../catalogue/catalogue";
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
  // A game keeps the classes it was made with, so a saved ship always has its
  // design. Classes added to the catalogue since join it; none it has changes.
  const state = s as GameState;
  for (const [id, design] of bundledDesigns()) {
    if (!(id in state.designs)) state.designs[id] = design;
  }
  return new Game(state);
}

/*
 * The autosave lives in the browser's database, not its local storage: a long
 * game, with every battle's shots in its log, soon outgrows local storage's
 * five megabytes, and a save that no longer fits there fails without a word.
 * An autosave from before the move is read from local storage until the
 * first new one replaces it.
 */

const DB_NAME = "mainline";
const STORE = "saves";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Keeps the game in the browser for Carry on. Resolves false if it could not be kept. */
export async function autosave(game: Game): Promise<boolean> {
  try {
    await withStore("readwrite", (store) => store.put(serialise(game), AUTOSAVE_KEY));
  } catch {
    return false;
  }
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // An old copy left behind is read only if the new one is missing.
  }
  return true;
}

export async function loadAutosave(): Promise<Game | null> {
  let text: string | undefined;
  try {
    text = (await withStore("readonly", (store) => store.get(AUTOSAVE_KEY))) as string | undefined;
  } catch {
    text = undefined;
  }
  try {
    text ??= localStorage.getItem(AUTOSAVE_KEY) ?? undefined;
    return text === undefined ? null : parseGame(text);
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
