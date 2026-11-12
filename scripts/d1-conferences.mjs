const names = [
  "A-10", "Atlantic 10", "Atlantic 10 Conference", "ACC", "Atlantic Coast",
  "America East", "America East Conference", "Am. East", "American", "American Athletic",
  "ASUN", "Atlantic Sun", "Big 12", "Big East", "Big Sky", "Big South", "Big Ten",
  "Big West", "CAA", "Colonial Athletic Association", "Coastal Athletic Association",
  "CUSA", "Conference USA", "Horizon", "Horizon League", "Ivy", "Ivy League", "MAC",
  "Mid-American", "MEAC", "Mid-Eastern Athletic", "Metro", "MAAC", "Metro Atlantic Athletic",
  "Mountain West", "MVC", "Missouri Valley", "NEC", "Northeast", "OVC", "Ohio Valley",
  "Pac-12", "Patriot", "Patriot League", "SEC", "Southeastern", "SoCon", "Southern",
  "Southland", "Summit", "Summit League", "Sun Belt", "SWAC", "Southwestern Athletic",
  "UAC", "WCC", "West Coast",
];
const normalize = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/conference$/, "");
const conferenceNames = new Set(names.map(normalize));

export function isD1Conference(value) {
  return conferenceNames.has(normalize(value));
}
