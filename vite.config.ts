import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

/** The version, out of package.json and into the build. */
const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: "./",
  server: { port: 5177 },
});
