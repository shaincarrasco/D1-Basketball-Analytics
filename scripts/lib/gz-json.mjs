// Gzipped JSON cache files (same convention as .cache/espn-pbp-*): ~5x smaller in the repo.
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";

/** Reads <path>.json.gz, falling back to a plain <path>.json from older runs. Null if neither parses. */
export async function readGzJson(path) {
  try { return JSON.parse(gunzipSync(await readFile(`${path}.json.gz`)).toString("utf8")); } catch { /* try plain */ }
  try { return JSON.parse(await readFile(`${path}.json`, "utf8")); } catch { return null; }
}
export async function writeGzJson(path, value) {
  await writeFile(`${path}.json.gz`, gzipSync(JSON.stringify(value), { level: 9 }));
}
