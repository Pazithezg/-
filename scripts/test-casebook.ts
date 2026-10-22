import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { startCasebook } from "./local-casebook";

const parent = resolve(".casebook-local");
await mkdir(parent, { recursive: true });
const dataDir = await mkdtemp(resolve(parent, "test-"));
const port = Number(process.env.CASEBOOK_TEST_PORT || "3100");
const adminEmail = "reviewer@casebook.local";
const adminPassword = randomBytes(18).toString("base64url");
const runtime = await startCasebook({ port, databasePort: 54330, dataDir, adminEmail, adminPassword });
let result = 1;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => { await runtime.stop(); process.exit(1); });
}
try {
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (runtime.child.exitCode !== null) throw new Error("The test web server stopped before becoming ready.");
    try {
      const response = await fetch(`${runtime.baseURL}/wellness`, { signal: AbortSignal.timeout(5000) });
      if (response.ok && runtime.child.exitCode === null) { ready = true; break; }
    } catch { /* The development server is still starting. */ }
    if (runtime.child.exitCode !== null) throw new Error("The test web server stopped before becoming ready.");
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!ready) throw new Error("The local test server did not become ready in two minutes.");
  const test = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "tests-node/wellness.spec.ts", "--workers=1"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_EXTERNAL_SERVER: "1",
      CASEBOOK_TEST_BASE_URL: runtime.baseURL,
      CASEBOOK_TEST_USER_EMAIL: "verification@example.invalid",
      CASEBOOK_TEST_USER_PASSWORD: randomBytes(18).toString("base64url"),
      CASEBOOK_TEST_ADMIN_EMAIL: adminEmail,
      CASEBOOK_TEST_ADMIN_PASSWORD: adminPassword
    }
  });
  result = await new Promise<number>((done, reject) => {
    test.once("error", reject);
    test.once("exit", (code) => done(code ?? 1));
  });
} finally {
  await runtime.stop();
  process.exitCode = result;
  console.log(`Isolated test database retained for diagnosis: ${dataDir}`);
}
