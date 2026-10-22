import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const migrations = ["20260703081551_init", "202610180001_casebook"] as const;

async function checkPort(port: number) {
  const probe = createServer();
  await new Promise<void>((resolveProbe, rejectProbe) => {
    probe.once("error", () => rejectProbe(new Error(`Local database port ${port} is busy. Stop the other Casebook process or choose another port.`)));
    probe.listen(port, "127.0.0.1", () => probe.close((error) => error ? rejectProbe(error) : resolveProbe()));
  });
}

/** Starts a separate on-disk PostgreSQL-compatible development database without reading .env. */
export async function startLocalDatabase(options: { dataDir?: string; port?: number } = {}) {
  const port = options.port ?? 54329;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Choose a local database port from 1024 to 65535.");
  }
  if (options.dataDir && /^[a-z]+:\/\//i.test(options.dataDir)) {
    throw new Error("The local database requires a filesystem directory.");
  }

  const dataDir = resolve(projectRoot, options.dataDir ?? ".casebook-local/db");
  await checkPort(port);
  await mkdir(dataDir, { recursive: true });
  const db = await PGlite.create(dataDir);
  let server: PGLiteSocketServer | undefined;

  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((row) => row.name));
    for (const migration of migrations) {
      if (applied.has(migration)) continue;
      const sql = await readFile(resolve(projectRoot, "prisma/migrations", migration, "migration.sql"), "utf8");
      await db.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration]);
      });
    }

    server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", inspect: false, maxConnections: 8 });
    server.addEventListener("error", () => {});
    await server.start();
    let stopped = false;
    return {
      url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
      dataDir,
      async stop() {
        if (stopped) return;
        stopped = true;
        try {
          await server!.stop();
        } finally {
          await db.close();
        }
      }
    };
  } catch (error) {
    if (server) await server.stop().catch(() => {});
    await db.close();
    throw error;
  }
}
