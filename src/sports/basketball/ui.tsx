"use client";
// Basketball bindings for the sport kit pages. Each route renders one of these, so the
// pack (which holds functions) never has to cross the server/client boundary.
import Builder from "@sports/kit/ui/builder";
import FrameworkRanks from "@sports/kit/ui/framework-ranks";
import Gallery, { type KitRoutes } from "@sports/kit/ui/gallery";
import RankingsBoard from "@sports/kit/ui/rankings-board";
import type { PlayerRow } from "@/app/players/player-stats";
import { useBasketball } from "./data";
import { basketball } from "./pack";

const routes: KitRoutes = { builder: "/charts/build/", rankings: "/players/rankings/" };

export function BasketballGallery() { return <Gallery pack={basketball} data={useBasketball()} routes={routes} />; }
export function BasketballBuilder() { return <Builder pack={basketball} data={useBasketball()} />; }
export function BasketballRankings() { return <RankingsBoard pack={basketball} data={useBasketball()} routes={routes} />; }
export function BasketballFrameworkRanks({ p, all }: { p: PlayerRow; all: PlayerRow[] }) { return <FrameworkRanks pack={basketball} p={p} all={all} routes={routes} />; }
