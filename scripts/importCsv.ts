import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "--origin" || !args[1] || args.length < 3) throw new Error("Usage: npm run import:csv -- --origin <user-reported origin> <file.csv> ...");
  const endpoint = new URL(process.env.GADV_API_URL || "http://localhost:5000");
  if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) throw new Error("Use HTTPS for remote imports");
  const token = process.env.GADV_WRITE_TOKEN;
  if (!token) throw new Error("GADV_WRITE_TOKEN is required");
  for (const filename of args.slice(2)) {
    const bytes = await readFile(filename);
    const form = new FormData();
    form.append("file", new Blob([bytes]), path.basename(filename));
    form.append("reported_origin", args[1]);
    const response = await fetch(new URL("/api/upload-csv", endpoint), { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const result = await response.json();
    if (!response.ok || !result.saved) throw new Error(`${path.basename(filename)}: ${result.message || "storage was not confirmed"}`);
    if (createHash("sha256").update(bytes).digest("hex") !== result.run.source_sha256 && !result.duplicate) throw new Error("Stored source hash mismatch");
    console.log(`${result.duplicate ? "Already saved" : "Saved"}: ${result.run.run_id} (${result.run.points.length} samples)`);
    for (const warning of result.warnings || []) console.warn(warning);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
