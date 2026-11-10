import type { Game, Player, Team } from "./types";

// Illustrative placeholders only; replace with validated provider feeds before production use.
export const demoTeams: Team[] = [
  {id:"duke",name:"Duke",shortName:"DUKE",conference:"ACC",wins:27,losses:6,record:"27-6",adjOffense:124.8,adjDefense:92.1,netRating:32.7,pace:69.8,sos:9.4},
  {id:"houston",name:"Houston",shortName:"HOU",conference:"Big 12",wins:30,losses:4,record:"30-4",adjOffense:119.2,adjDefense:88.4,netRating:30.8,pace:64.1,sos:11.2},
  {id:"kansas",name:"Kansas",shortName:"KU",conference:"Big 12",wins:24,losses:10,record:"24-10",adjOffense:121.1,adjDefense:96.3,netRating:24.8,pace:68.5,sos:10.8},
  {id:"uconn",name:"UConn",shortName:"CONN",conference:"Big East",wins:29,losses:5,record:"29-5",adjOffense:123.4,adjDefense:94.1,netRating:29.3,pace:66.9,sos:8.7},
  {id:"tennessee",name:"Tennessee",shortName:"TENN",conference:"SEC",wins:26,losses:8,record:"26-8",adjOffense:117.8,adjDefense:91.2,netRating:26.6,pace:67.2,sos:10.1},
  {id:"arizona",name:"Arizona",shortName:"ARIZ",conference:"Big 12",wins:25,losses:8,record:"25-8",adjOffense:122.1,adjDefense:98.6,netRating:23.5,pace:72.4,sos:7.9},
  {id:"purdue",name:"Purdue",shortName:"PUR",conference:"Big Ten",wins:28,losses:6,record:"28-6",adjOffense:126.1,adjDefense:97.8,netRating:28.3,pace:66.2,sos:8.8},
  {id:"auburn",name:"Auburn",shortName:"AUB",conference:"SEC",wins:27,losses:7,record:"27-7",adjOffense:120.3,adjDefense:93.5,netRating:26.8,pace:70.1,sos:9.2}
];

export const demoPlayers: Player[] = [
  {id:"p1",name:"Cooper Flagg",teamName:"Duke",position:"F",year:"Freshman",minutes:30.5,points:19.2,rebounds:7.5,assists:4.2,usage:28.1,efg:54.8,ts:58.9,bpm:10.2,impact:9.8},
  {id:"p2",name:"Hunter Dickinson",teamName:"Kansas",position:"C",year:"Senior",minutes:27.8,points:17.0,rebounds:9.0,assists:2.1,usage:27.4,efg:58.2,ts:62.1,bpm:7.8,impact:8.9},
  {id:"p3",name:"RJ Luis Jr.",teamName:"St. John's",position:"G/F",year:"Senior",minutes:31.2,points:18.5,rebounds:7.2,assists:2.0,usage:25.7,efg:51.2,ts:55.4,bpm:6.9,impact:8.2},
  {id:"p4",name:"Walter Clayton Jr.",teamName:"Florida",position:"G",year:"Senior",minutes:32.1,points:18.3,rebounds:3.8,assists:4.2,usage:26.4,efg:56.1,ts:60.2,bpm:8.1,impact:8.7},
  {id:"p5",name:"Johni Broome",teamName:"Auburn",position:"F/C",year:"Senior",minutes:27.4,points:18.0,rebounds:10.8,assists:3.1,usage:29.2,efg:57.0,ts:61.5,bpm:9.1,impact:9.1}
];

export const demoGames: Game[] = [
  {id:"g1",date:"2026-11-10",awayTeam:"Kansas",homeTeam:"Duke",status:"scheduled",conferenceGame:false},
  {id:"g2",date:"2026-11-10",awayTeam:"Houston",homeTeam:"Auburn",status:"scheduled",conferenceGame:false},
  {id:"g3",date:"2026-11-11",awayTeam:"Arizona",homeTeam:"Tennessee",status:"scheduled",conferenceGame:false},
  {id:"g4",date:"2026-11-12",awayTeam:"Purdue",homeTeam:"UConn",status:"scheduled",conferenceGame:false}
];
