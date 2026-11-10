export interface ProviderHealth { name: string; configured: boolean; capabilities: string[]; notes: string }
export function providerHealth(): ProviderHealth[] {
  return [
    {name:"College Basketball Data",configured:!!process.env.CBBD_API_KEY,capabilities:["teams (adapter pending)","games (adapter pending)","player stats (adapter pending)"],notes:"Current API schema and quota must be verified before enabling live output."},
    {name:"SportsDataIO",configured:!!process.env.SPORTSDATAIO_API_KEY,capabilities:[],notes:"Optional provider; no live adapter yet."},
    {name:"API Ninjas",configured:!!process.env.API_NINJAS_KEY,capabilities:[],notes:"Optional provider; college coverage must be validated."}
  ];
}
