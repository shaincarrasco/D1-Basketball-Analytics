import type { Game, Player, Team } from "./types";

export const teams: Team[] = [
  { id:"duke",name:"Duke",conference:"ACC",wins:27,losses:6,adjO:124.8,adjD:92.1,net:32.7,tempo:69.8,sos:9.4 },
  { id:"houston",name:"Houston",conference:"Big 12",wins:30,losses:4,adjO:119.2,adjD:88.4,net:30.8,tempo:64.1,sos:11.2 },
  { id:"kansas",name:"Kansas",conference:"Big 12",wins:24,losses:10,adjO:121.1,adjD:96.3,net:24.8,tempo:68.5,sos:10.8 },
  { id:"uconn",name:"UConn",conference:"Big East",wins:29,losses:5,adjO:123.4,adjD:94.1,net:29.3,tempo:66.9,sos:8.7 },
  { id:"tennessee",name:"Tennessee",conference:"SEC",wins:26,losses:8,adjO:117.8,adjD:91.2,net:26.6,tempo:67.2,sos:10.1 },
  { id:"arizona",name:"Arizona",conference:"Big 12",wins:25,losses:8,adjO:122.1,adjD:98.6,net:23.5,tempo:72.4,sos:7.9 },
  { id:"purdue",name:"Purdue",conference:"Big Ten",wins:28,losses:6,adjO:126.1,adjD:97.8,net:28.3,tempo:66.2,sos:8.8 },
  { id:"auburn",name:"Auburn",conference:"SEC",wins:27,losses:7,adjO:120.3,adjD:93.5,net:26.8,tempo:70.1,sos:9.2 }
];

export const players: Player[] = [
  {id:"p1",name:"Cooper Flagg",team:"Duke",position:"F",year:"Freshman",mpg:30.5,ppg:19.2,rpg:7.5,apg:4.2,usage:28.1,efg:54.8,ts:58.9,bpm:10.2,impact:9.8},
  {id:"p2",name:"Hunter Dickinson",team:"Kansas",position:"C",year:"Senior",mpg:27.8,ppg:17.0,rpg:9.0,apg:2.1,usage:27.4,efg:58.2,ts:62.1,bpm:7.8,impact:8.9},
  {id:"p3",name:"RJ Luis Jr.",team:"St. John's",position:"G/F",year:"Senior",mpg:31.2,ppg:18.5,rpg:7.2,apg:2.0,usage:25.7,efg:51.2,ts:55.4,bpm:6.9,impact:8.2},
  {id:"p4",name:"Walter Clayton Jr.",team:"Florida",position:"G",year:"Senior",mpg:32.1,ppg:18.3,rpg:3.8,apg:4.2,usage:26.4,efg:56.1,ts:60.2,bpm:8.1,impact:8.7},
  {id:"p5",name:"Johni Broome",team:"Auburn",position:"F/C",year:"Senior",mpg:27.4,ppg:18. broome,rpg:10.8,apg:3.1,usage:29.2,efg:57.0,ts:61.5,bpm:9.1,impact:9.1}
];

export const games: Game[] = [
  {id:"g1",date:"2026-11-10",away:"Kansas",home:"Duke",status:"scheduled"},
  {id:"g2",date:"2026-11-10",away:"Houston",home:"Auburn",status:"scheduled"},
  {id:"g3",date:"2026-11-11",away:"Arizona",home:"Tennessee",status:"scheduled"},
  {id:"g4",date:"2026-11-12",away:"Purdue",home:"UConn",status:"scheduled"}
];
