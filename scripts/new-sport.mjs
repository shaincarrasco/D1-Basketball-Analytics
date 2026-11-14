#!/usr/bin/env node
// Scaffold a new sport pack: npm run new-sport -- <id> "<Display name>"
//   e.g. npm run new-sport -- hockey "College hockey"
// Creates src/sports/<id>/ with a starter pack + fixtures that already pass the
// conformance suite, and registers it on the /lab/sports/ preview. Then replace the
// starter stats with the real ones (see docs/SPORT-KIT.md).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [id, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();
if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || !name) {
  console.error('Usage: npm run new-sport -- <id> "<Display name>"   (id: lowercase slug, e.g. hockey)');
  process.exit(1);
}
const dir = path.join(root, "src/sports", id);
if (existsSync(dir)) { console.error(`src/sports/${id} already exists.`); process.exit(1); }
const camel = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const Type = camel[0].toUpperCase() + camel.slice(1) + "Row";
const seed = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 100000;

const files = {
  "types.ts": `// One ${name.toLowerCase()} player's season. Replace these starter fields with the real feed's fields.
export type ${Type} = {
  id: string;
  name: string;
  /** Position key: must be one of the pack's positions (or null). */
  pos: "A" | "B" | null;
  team: { id: string; name: string; short: string; color: string | null; group: string; groupName: string } | null;
  games: number;
  minutes: number;
  scores: number;
  attempts: number;
  assists: number;
  errors: number;
};
`,
  "pack.ts": `// ${name} sport pack. STARTER: every stat, filter, framework and chart below is a
// placeholder that shows the shape. Replace them with real ${name.toLowerCase()} stats.
// Rules are enforced by src/sport-kit/validate.ts (npm test).
import { floorFilter, positionFilter, type FilterDef, type Metric, type SportPack } from "@/sport-kit";
import type { ${Type} } from "./types";

type M = Metric<${Type}>;
const perGame = (v: number, r: ${Type}) => (r.games ? v / r.games : null);

const METRICS: M[] = [
  { key: "scoresG", label: "Scores per game", short: "Sc/G", group: "Attack", get: r => perGame(r.scores, r), desc: "Scores per game played." },
  { key: "convPct", label: "Conversion", short: "Conv%", group: "Attack", unit: "%", ok: r => r.attempts >= 10, get: r => (r.attempts ? (r.scores / r.attempts) * 100 : null), desc: "Share of attempts that score (needs 10+ attempts)." },
  { key: "assistsG", label: "Assists per game", short: "Ast/G", group: "Attack", get: r => perGame(r.assists, r), desc: "Assists per game played." },
  { key: "errorsG", label: "Errors per game", short: "Err/G", group: "Discipline", invert: true, get: r => perGame(r.errors, r), desc: "Errors per game played (lower is better)." },
  { key: "minutesG", label: "Minutes per game", short: "Min/G", group: "Discipline", get: r => perGame(r.minutes, r), desc: "Average playing time." },
];

const POSITIONS = [
  { key: "A", label: "Attacker", plural: "Attackers", tone: "bulb" },
  { key: "B", label: "Back", plural: "Backs", tone: "def" },
] as const;

const entity: SportPack<${Type}>["entity"] = {
  id: r => r.id,
  name: r => r.name,
  pos: r => r.pos,
  team: r => (r.team ? { name: r.team.name, short: r.team.short, color: r.team.color, group: r.team.group, groupName: r.team.groupName } : null),
  href: () => null,
  exposure: r => r.minutes,
};

const FILTERS: FilterDef<${Type}>[] = [
  {
    key: "league", label: "League", default: "all", compact: true,
    options: lists => [{ value: "all", label: "All leagues" }, ...(lists.league ?? []).map(([value, label]) => ({ value, label }))],
    test: (r, v) => v === "all" || r.team?.group === v,
    describe: (v, lists) => (v === "all" ? null : { noun: \`\${lists.league?.find(l => l[0] === v)?.[1] ?? v} players\` }),
  },
  positionFilter({ positions: [...POSITIONS], entity }),
  floorFilter<${Type}>({ key: "gp", label: "Games", get: r => r.games, steps: [1, 3, 5, 10], default: 3, fmt: n => \`\${n}+ games\`, anyLabel: "Any games", suffix: n => \`\${n}+ games\`, compact: true }),
];

export const ${camel}: SportPack<${Type}> = {
  id: "${id}",
  name: "${name}",
  brand: "${name.toUpperCase().slice(0, 14)}",
  filePrefix: "${id}",
  nouns: { player: "player", players: "players", pool: "${name.toLowerCase()} players", pronoun: "they" },
  entity,
  positions: [...POSITIONS],
  groups: { label: "League", list: "league" },
  metrics: METRICS,
  metricGroups: ["Attack", "Discipline"],
  filters: FILTERS,
  frameworks: [
    { key: "overall", label: "Overall", blurb: "Scoring, efficiency and creating, with errors held against.", weights: [["scoresG", 35], ["convPct", 25], ["assistsG", 25], ["errorsG", 15]] },
    { key: "finisher", label: "Finisher", blurb: "Scores and converts.", weights: [["scoresG", 50], ["convPct", 50]] },
  ],
  tiers: [{ min: 97, label: "Elite" }, { min: 90, label: "Excellent" }, { min: 75, label: "Very good" }, { min: 50, label: "Solid" }, { min: 0, label: "Developing" }],
  ranking: { minCoverage: 0.6, shrinkK: 300, shrinkUnit: "minutes" },
  charts: {
    defaultX: "scoresG", defaultY: "convPct",
    profileMetrics: ["scoresG", "convPct", "assistsG", "errorsG", "minutesG"],
    sections: ["Attack", "Discipline"],
    presets: [
      { id: "volume-efficiency", section: "Attack", blurb: "Scoring volume against conversion.", spec: { x: "scoresG", y: "convPct", title: "Volume vs efficiency", quads: ["Efficient, low volume", "Elite finishers", "Quiet", "Volume over value"] } },
      { id: "scores-leaders", section: "Attack", blurb: "Scores per game leaders.", spec: { type: "bars", x: "scoresG", title: "Scoring leaders" } },
      { id: "errors-swarm", section: "Discipline", blurb: "Everyone's error rate, split by position.", spec: { type: "swarm", x: "errorsG", color: "pos" } },
      { id: "top-compare", section: "Discipline", blurb: "The top three scorers side by side.", topBy: "scoresG", spec: { type: "profile" } },
    ],
  },
};
`,
  "fixtures.ts": `// Deterministic fictional rows for tests and the /lab/sports/ preview. Shape them like the
// real sport (position differences, realistic ranges) so the preview charts look right.
import { fakeName, fakeTeams, seeded } from "@/sport-kit/fixtures";
import type { ${Type} } from "./types";

export function fixtures(n = 160): ${Type}[] {
  const rng = seeded(${seed});
  const teams = fakeTeams([["north-test", "North Test League"], ["south-test", "South Test League"]]);
  return Array.from({ length: n }, (_, i) => {
    const t = teams[i % teams.length];
    const pos = i % 2 ? "A" : "B";
    const games = rng.int(2, 14), minutes = Math.round(games * rng.normal(55, 15, 10, 90));
    const attempts = Math.round(games * rng.normal(pos === "A" ? 4 : 1.5, 1, 0));
    const scores = Math.round(attempts * rng.normal(0.3, 0.08, 0, 0.8));
    return {
      id: \`${id.slice(0, 3)}\${i}\`, name: fakeName(i), pos,
      team: { id: t.id, name: t.name, short: t.short, color: t.color, group: t.group, groupName: t.groupName },
      games, minutes, scores, attempts, assists: Math.round(games * rng.normal(pos === "A" ? 1.2 : 0.6, 0.4, 0)), errors: Math.round(games * rng.normal(1, 0.4, 0)),
    };
  });
}
`,
  "index.ts": `// Pure entry point (no React): the pack and its fixtures. The conformance tests and the
// sport lab load every src/sports/*/index.ts.
export { ${camel} as pack } from "./pack";
export { fixtures } from "./fixtures";
`,
};

mkdirSync(dir, { recursive: true });
for (const [f, body] of Object.entries(files)) writeFileSync(path.join(dir, f), body);

// Register on the sport lab.
const regPath = path.join(root, "src/sports/registry.ts");
let reg = readFileSync(regPath, "utf8");
reg = reg.replace(/(import \* as [\w$]+ from "\.\/[\w-]+";\n)(?!import \* as)/, `$1import * as ${camel} from "./${id}";\n`);
reg = reg.replace(/export const SPORTS = \[([^\]]*)\]/, (_, list) => `export const SPORTS = [${list.trim()}, ${camel}]`);
writeFileSync(regPath, reg);

console.log(`Created src/sports/${id}/ (types, pack, fixtures, index) and added it to the sport lab.

Next:
  1. npm test                          # the starter already passes; keep it green as you edit
  2. Replace types.ts with the real feed's fields, then the stats in pack.ts
  3. Make fixtures.ts look like the real sport
  4. npm run dev → /lab/sports/?sport=${id}
  5. When real data exists: add src/sports/${id}/data.ts + ui.tsx and routes (see docs/SPORT-KIT.md)`);
