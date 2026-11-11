const names = [
  "A-10", "Atlantic 10", "ACC", "America East", "American", "ASUN", "Atlantic Sun",
  "Big 12", "Big East", "Big Sky", "Big South", "Big Ten", "Big West", "CAA", "CUSA",
  "Horizon", "Ivy", "MAC", "MEAC", "Metro", "MAAC", "Mountain West", "MVC", "NEC",
  "OVC", "Pac-12", "Patriot", "SEC", "SoCon", "Southland", "Summit", "Sun Belt",
  "SWAC", "UAC", "WCC",
];
const normalize = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const conferenceNames = new Set(names.map(normalize));

export function isD1Conference(value) {
  return conferenceNames.has(normalize(value));
}
