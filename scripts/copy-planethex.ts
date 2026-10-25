/**
 * Copies the part of PlanetHex that turns a .sector file into worlds into
 * src/planethex/, verbatim, with nothing else: the files the sector document,
 * the generator and the sector file export reach, found by following their
 * imports. Run it from Mainline's folder after PlanetHex changes:
 *
 *   npx vite-node scripts/copy-planethex.ts [path to PlanetHex]
 *
 * The bundled sectors' worlds are checked by the tests, so a PlanetHex change
 * that rolls them differently fails `npm test` rather than going unnoticed.
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { build } from "esbuild";

const from = resolve(process.argv[2] ?? "../PlanetHex");
const to = resolve("src/planethex");
const ENTRIES = ["src/sector.ts", "src/io/export/subsector.ts"];

const result = await build({
  entryPoints: ENTRIES.map((e) => join(from, e)),
  bundle: true,
  write: false,
  metafile: true,
  format: "esm",
  platform: "neutral",
  outdir: "out",
  logLevel: "error",
});
const files = Object.keys(result.metafile.inputs)
  .map((f) => resolve(f))
  .filter((f) => f.startsWith(join(from, "src")))
  .sort();

rmSync(to, { recursive: true, force: true });
for (const file of files) {
  const target = join(to, relative(join(from, "src"), file));
  mkdirSync(dirname(target), { recursive: true });
  cpSync(file, target);
}
const commit = execSync("git rev-parse --short HEAD", { cwd: from }).toString().trim();
writeFileSync(
  join(to, "README.md"),
  [
    "# PlanetHex, the sector generator",
    "",
    `A verbatim copy of the files of [PlanetHex](https://github.com/Doomy66/PlanetHex) at ${commit} that read a`,
    "`.sector` document and roll its worlds. Do not edit them here: change PlanetHex and run",
    "`npx vite-node scripts/copy-planethex.ts` to copy them over again.",
    "",
  ].join("\n"),
);
console.log(`${files.length} files from PlanetHex ${commit} copied to src/planethex/`);
