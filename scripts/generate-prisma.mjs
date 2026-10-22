import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Client generation reads the schema and never connects to a database. Give only
// this child a non-routable local placeholder when no connection is supplied.
const generated = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)), "generate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "postgresql://unused:unused@127.0.0.1:1/generate_only" }
});
if (generated.error) console.error("Prisma client generation could not start.");
process.exitCode = generated.status ?? 1;
