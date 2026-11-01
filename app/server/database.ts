import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// DATABASE_URL must point to persistent PostgreSQL; no filesystem fallback.
export const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 10000 })
  : null;
pool?.on("error", () => console.error("[database] Idle connection failed"));
export const database = pool ? drizzle(pool) : null;

export class StorageError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

export function requireDatabase() {
  if (!database) throw new StorageError("Durable storage is not configured. Set DATABASE_URL and run npm run db:migrate.");
  return database;
}
