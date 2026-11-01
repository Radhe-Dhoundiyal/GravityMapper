import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pool } from "./database";

export async function migrateDatabase() {
  if (!pool) throw new Error("DATABASE_URL is required");
  const sql = (await readFile(new URL("../../migrations/0001_durable_runs.sql", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const hash = createHash("sha256").update(sql).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(182309152)");
    await client.query("CREATE TABLE IF NOT EXISTS gm_migrations (version text PRIMARY KEY, sha256 text NOT NULL)");
    const applied = await client.query("SELECT sha256 FROM gm_migrations WHERE version = $1", ["0001"]);
    if (applied.rowCount && applied.rows[0].sha256 !== hash) throw new Error("Migration checksum mismatch");
    if (!applied.rowCount) {
      await client.query(sql);
      await client.query("INSERT INTO gm_migrations VALUES ($1, $2)", ["0001", hash]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/migrate.ts")) {
  migrateDatabase().then(() => console.log("Database migration complete"))
    .catch(() => { console.error("Database migration failed; check DATABASE_URL and database permissions"); process.exitCode = 1; })
    .finally(() => pool?.end());
}
