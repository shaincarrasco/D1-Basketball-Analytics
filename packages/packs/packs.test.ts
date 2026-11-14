// Every folder here with an index.ts exporting { pack, fixtures } gets the full
// conformance suite. SPORT=tennis npm test checks one pack.
import { it, expect } from "vitest";
import { conformance, type PackModule } from "@sports/kit/testing";

const loaders = import.meta.glob<Omit<PackModule, "dir">>("./*/index.ts");
const only = process.env.SPORT;
const sports = await Promise.all(
  Object.entries(loaders).filter(([p]) => !only || p.split("/")[1] === only).map(async ([p, load]) => ({ dir: p.split("/")[1], ...(await load()) })),
);
it("finds packs", () => expect(sports.length).toBeGreaterThan(0));
conformance(sports);
