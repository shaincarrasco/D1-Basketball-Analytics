// Sport kit: a sport-agnostic engine for player rankings, chart galleries and a chart
// builder. See docs/SPORT-KIT.md for how to add a sport.
export * from "./types";
export * from "./stats";
export * from "./metrics";
export * from "./pool";
export * from "./rank";
export * from "./spec";
export * from "./validate";

import type { SportPack as Pack } from "./types";
/** Same pack, different entity accessors: how a site adds its own profile links. */
export const withEntity = <R>(pack: Pack<R>, over: Partial<Pack<R>["entity"]>): Pack<R> => ({ ...pack, entity: { ...pack.entity, ...over } });
