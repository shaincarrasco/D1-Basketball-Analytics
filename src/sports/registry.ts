// Every sport pack with its fixtures, for the /lab/sports/ preview and tooling.
// Add a line here when you add a folder under src/sports/ (the test suite finds packs
// on its own; this list is only for the preview page).
import * as basketball from "./basketball";
import * as football from "./football";
import * as soccer from "./soccer";
import * as tennis from "./tennis";
import type { SportPack } from "@/sport-kit";

export type SportEntry = { pack: SportPack<unknown>; fixtures: () => unknown[] };
export const SPORTS = [basketball, soccer, football, tennis] as unknown as SportEntry[];
