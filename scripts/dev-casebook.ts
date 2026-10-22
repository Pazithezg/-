import { randomBytes } from "node:crypto";
import { startCasebook } from "./local-casebook";

// Each local demo gets fresh credentials. Nothing is written to disk or used in production.
const adminEmail = "reviewer@casebook.local";
const adminPassword = randomBytes(18).toString("base64url");
const port = Number(process.env.PORT || "3000");

try {
  const runtime = await startCasebook({ port, adminEmail, adminPassword });
  console.log(`\nCasebook: ${runtime.baseURL}/wellness`);
  console.log("Separate local database: .casebook-local/db (original database is not used)");
  console.log(`Reviewer login: ${adminEmail}`);
  console.log(`Reviewer password for this run: ${adminPassword}\n`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => { await runtime.stop(); process.exit(0); });
  }
  runtime.child.once("exit", async (code) => {
    await runtime.stop();
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "The local Casebook could not start.");
  process.exitCode = 1;
}
