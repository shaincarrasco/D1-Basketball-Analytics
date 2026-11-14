// Build-time loader for form.json (rating history + dated game performances).
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FormFile } from "./form";
import { allForms, indispensability, movers, type Indispensable } from "./form";
import { getPlayers, getTeams } from "./server-data";
import { playerRows } from "./players";

let cached: FormFile | null = null;
export function getForm(): FormFile {
  if (!cached) {
    try {
      cached = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "app", "form.json"), "utf8")) as FormFile;
    } catch {
      // Older data builds have no form file: every form view shows its empty state.
      cached = { asOf: null, history: null, perf: {} };
    }
  }
  return cached;
}

// Whole-league results are computed once per build and shared by every page.

let formsMemo: ReturnType<typeof allForms> | null = null;
export const getAllForms = () => (formsMemo ??= allForms(getTeams(), getForm()));
let moversMemo: ReturnType<typeof movers> | null = null;
export const getMovers = () => (moversMemo ??= movers(getForm()));
let preMemo: ReturnType<typeof movers> | null = null;
export const getPreseasonMovers = () => (preMemo ??= movers(getForm(), null));
let indMemo: Indispensable[] | null = null;
export const getIndispensable = () => (indMemo ??= indispensability(playerRows(getPlayers(), getPlayers().rows), getTeams()));
