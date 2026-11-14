"use client";
// Basketball bindings for the sport kit pages. Each route renders one of these, so the
// pack (which holds functions) never has to cross the server/client boundary.
import Builder from "@/sport-kit/ui/builder";
import FrameworkRanks from "@/sport-kit/ui/framework-ranks";
import Gallery, { type KitRoutes } from "@/sport-kit/ui/gallery";
import RankingsBoard from "@/sport-kit/ui/rankings-board";
import type { PlayerRow } from "@/app/players/player-stats";
import { useBasketball } from "./data";
import { basketball } from "./pack";

const routes: KitRoutes = { builder: "/charts/build/", rankings: "/players/rankings/" };

export function BasketballGallery() { return <Gallery pack={basketball} data={useBasketball()} routes={routes} />; }
export function BasketballBuilder() { return <Builder pack={basketball} data={useBasketball()} />; }
export function BasketballRankings() { return <RankingsBoard pack={basketball} data={useBasketball()} routes={routes} />; }
export function BasketballFrameworkRanks({ p, all }: { p: PlayerRow; all: PlayerRow[] }) { return <FrameworkRanks pack={basketball} p={p} all={all} routes={routes} />; }
