import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runStorage, canonicalJson, sha256, type StoredRun } from "./runStorage";
import { pool } from "./database";

async function main() {
  if (!pool) throw new Error("DATABASE_URL is required");
  const root = path.resolve(process.argv[2] || "data/runs");
  let imported = 0;
  for (const directory of await readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    for (const file of await readdir(path.join(root, directory.name))) {
      if (!file.endsWith(".json")) continue;
      const original = await readFile(path.join(root, directory.name, file));
      const run = JSON.parse(original.toString("utf8")) as StoredRun;
      if (!run.run_id || !run.experiment_id || !run.points?.length) throw new Error(`Invalid legacy run: ${file}`);
      await runStorage.importRun(run, original, file, sha256(canonicalJson(run)));
      imported++;
    }
  }
  console.log(`Confirmed ${imported} legacy runs in PostgreSQL; original JSON files retained`);
}
main().catch(() => { console.error("Legacy import failed; source files retained. Check database and run conflicts."); process.exitCode = 1; }).finally(() => pool?.end());
