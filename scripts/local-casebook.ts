import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma";
import { seedWellnessCases } from "../lib/wellness-seed";
import { startLocalDatabase } from "./local-database";

const root = fileURLToPath(new URL("../", import.meta.url));

export async function startCasebook(options: {
  port: number;
  adminEmail: string;
  adminPassword: string;
  dataDir?: string;
  databasePort?: number;
}) {
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error("Choose a web port from 1024 to 65535.");
  }
  const probe = createServer();
  await new Promise<void>((done, reject) => {
    probe.once("error", () => reject(new Error(`Web port ${options.port} is busy. Stop the other process or choose another port.`)));
    probe.listen(options.port, "127.0.0.1", () => probe.close((error) => error ? reject(error) : done()));
  });
  const local = await startLocalDatabase({ dataDir: options.dataDir, port: options.databasePort });
  try {
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: local.url, max: 1 }) });
    try { await seedWellnessCases(db); } finally { await db.$disconnect(); }
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(options.port)], {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: local.url,
        CASEBOOK_LOCAL_DATABASE: "1",
        ADMIN_BASIC_USER: options.adminEmail,
        ADMIN_BASIC_PASSWORD: options.adminPassword,
        ADMIN_SESSION_SECRET: randomBytes(48).toString("base64url"),
        PRISMA_LOG_LEVEL: "silent",
        NEXT_TELEMETRY_DISABLED: "1"
      }
    });
    let stopped = false;
    return {
      child,
      baseURL: `http://127.0.0.1:${options.port}`,
      databaseURL: local.url,
      async stop() {
        if (stopped) return;
        stopped = true;
        if (child.exitCode === null && child.pid) {
          // Next dev owns a server subprocess; terminate only this process tree.
          if (process.platform === "win32") {
            spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
          } else {
            child.kill("SIGTERM");
          }
        }
        await local.stop();
      }
    };
  } catch (error) {
    await local.stop();
    throw error;
  }
}
