import type { MetricDefinition, Team } from "./types";

export const metricDefinitions: MetricDefinition[] = [
  {key:"adjOffense",label:"Adjusted offense",description:"Points scored per 100 possessions, adjusted for opponent and venue.",unit:"pts/100",higherIsBetter:true,formula:"Opponent- and venue-adjusted points / possessions × 100",caveat:"Requires possession-level or reliable box-score data across opponents."},
  {key:"adjDefense",label:"Adjusted defense",description:"Points allowed per 100 possessions, adjusted for opponent and venue.",unit:"pts/100",higherIsBetter:false,formula:"Opponent- and venue-adjusted points allowed / possessions × 100",caveat:"Lower is better; small samples are volatile."},
  {key:"netRating",label:"Net rating",description:"Adjusted offensive efficiency minus adjusted defensive efficiency.",unit:"pts/100",higherIsBetter:true,formula:"Adjusted offense − adjusted defense",caveat:"Only comparable when the component ratings use the same model."},
  {key:"pace",label:"Tempo",description:"Estimated possessions per 40 minutes.",unit:"poss/40",higherIsBetter:false,formula:"Possessions / minutes × 40",caveat:"Tempo is descriptive, not a quality rating."},
  {key:"efgPct",label:"Effective FG%",description:"Field-goal percentage with extra value assigned to 3-pointers.",unit:"%",higherIsBetter:true,formula:"(FGM + 0.5 × 3PM) / FGA × 100",caveat:"Shot quality and opponent context are not captured by the raw rate."},
  {key:"tovPct",label:"Turnover %",description:"Estimated share of possessions ending in a turnover.",unit:"%",higherIsBetter:false,formula:"Turnovers / possessions × 100",caveat:"Use a consistent possession estimator across providers."},
  {key:"orbPct",label:"Offensive rebound %",description:"Share of available offensive rebounds secured.",unit:"%",higherIsBetter:true,formula:"ORB / (ORB + opponent DRB) × 100",caveat:"Requires opponent defensive rebounds."},
  {key:"ftRate",label:"Free-throw rate",description:"Free-throw attempts relative to field-goal attempts.",unit:"%",higherIsBetter:true,formula:"FTA / FGA × 100",caveat:"Provider conventions may vary."}
];

export function rankTeams(teams: Team[], key: keyof Team, higherIsBetter = true) {
  return [...teams].sort((a,b) => {
    const av=a[key], bv=b[key];
    if (av == null) return 1;
    if (bv == null) return -1;
    return higherIsBetter ? Number(bv)-Number(av) : Number(av)-Number(bv);
  });
}
