// Build-time read of the projected field (scripts/build-bracket.mjs → public/data/app/bracket.json).
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BracketFile } from "@/lib/bracket";

export function getBracket(): BracketFile | null {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "app", "bracket.json"), "utf8")) as BracketFile;
  } catch {
    return null;
  }
}
