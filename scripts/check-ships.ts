/**
 * Runs every .ship in ships/ through the design engine and prints what the
 * sheet says: price, hull, armour, drives, weapons, and any rule it breaks.
 *
 *   npx vite-node scripts/check-ships.ts [file ...]
 *
 * Exits non-zero if any design has an error, so it can gate a commit.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sheet } from "../src/shipdesign/engine/sheet";
import type { Design } from "../src/shipdesign/engine/design";

const dir = "ships";
const wanted = process.argv.slice(2);
const files = wanted.length > 0 ? wanted : readdirSync(dir).filter((f) => f.endsWith(".ship")).map((f) => join(dir, f));
let bad = 0;
for (const file of files) {
  const design = JSON.parse(readFileSync(file, "utf8")) as Design;
  const s = sheet(design);
  const thrust = typeof design.manoeuvre === "number" ? design.manoeuvre : design.manoeuvre?.thrust ?? 0;
  const jump = typeof design.jump === "number" ? design.jump : design.jump?.rating ?? 0;
  const errors = s.problems.filter((p) => p.severity === "error");
  if (errors.length > 0) bad++;
  console.log(
    `${errors.length > 0 ? "FAIL" : "ok  "} ${file}: ${design.name} TL${design.tl} ${s.hullTons}t M${thrust} J${jump} ` +
      `hull ${s.hullPoints} armour ${s.armourProtection} MCr${s.purchaseCost.toFixed(2)} cargo ${s.cargoTons} crew ${s.crewTotal}`,
  );
  for (const p of s.problems) console.log(`       ${p.severity}: ${p.message} (${p.clause})`);
}
process.exit(bad > 0 ? 1 : 0);
