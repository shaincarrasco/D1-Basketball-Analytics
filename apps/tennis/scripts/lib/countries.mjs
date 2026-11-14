// Country display data. theScore gives full country names; the short code is IOC-style.
// Names not in the table fall back to their first three letters, uppercased.
const IOC = {
  "usa": "USA", "united states": "USA", "france": "FRA", "italy": "ITA", "argentina": "ARG",
  "spain": "ESP", "great britain": "GBR", "united kingdom": "GBR", "australia": "AUS",
  "germany": "GER", "japan": "JPN", "switzerland": "SUI", "brazil": "BRA", "neutral": "AIN",
  "china": "CHN", "czech republic": "CZE", "czechia": "CZE", "ukraine": "UKR", "russia": "RUS",
  "serbia": "SRB", "canada": "CAN", "netherlands": "NED", "belgium": "BEL", "austria": "AUT",
  "poland": "POL", "croatia": "CRO", "bulgaria": "BUL", "greece": "GRE", "hungary": "HUN",
  "romania": "ROU", "slovakia": "SVK", "sweden": "SWE", "finland": "FIN", "norway": "NOR",
  "denmark": "DEN", "portugal": "POR", "chile": "CHI", "colombia": "COL", "peru": "PER",
  "mexico": "MEX", "uruguay": "URU", "ecuador": "ECU", "india": "IND", "thailand": "THA",
  "south korea": "KOR", "korea": "KOR", "chinese taipei": "TPE", "taiwan": "TPE", "turkey": "TUR",
  "türkiye": "TUR", "israel": "ISR", "belarus": "BLR", "latvia": "LAT", "estonia": "EST",
  "lithuania": "LTU", "slovenia": "SLO", "bosnia and herzegovina": "BIH", "montenegro": "MNE",
  "moldova": "MDA", "georgia": "GEO", "armenia": "ARM", "azerbaijan": "AZE", "kazakhstan": "KAZ",
  "uzbekistan": "UZB", "egypt": "EGY", "south africa": "RSA", "new zealand": "NZL", "ireland": "IRL",
  "cyprus": "CYP", "monaco": "MON", "luxembourg": "LUX", "iceland": "ISL", "bahamas": "BAH",
  "jamaica": "JAM", "dominican republic": "DOM", "puerto rico": "PUR", "venezuela": "VEN",
  "paraguay": "PAR", "bolivia": "BOL", "costa rica": "CRC", "guatemala": "GUA", "philippines": "PHI",
  "indonesia": "INA", "hong kong": "HKG", "morocco": "MAR", "tunisia": "TUN", "saudi arabia": "KSA",
  "qatar": "QAT", "united arab emirates": "UAE", "vietnam": "VIE", "malaysia": "MAS",
  "singapore": "SIN", "kosovo": "KOS", "bahrain": "BRN", "iran": "IRI", "pakistan": "PAK",
  "nigeria": "NGR", "zimbabwe": "ZIM", "kenya": "KEN", "ivory coast": "CIV", "cote d'ivoire": "CIV",
};

// Twelve fixed colours; a country always gets the same one because the index comes from a hash.
const PALETTE = [
  "#c8102e", "#003087", "#ffb81c", "#00843d", "#582c83", "#e35205",
  "#0072ce", "#8c1d40", "#2e7d32", "#6d2e91", "#d4a017", "#00838f",
];

/** FNV-1a 32-bit hash of a string. */
function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** { name, short, color } for a country name as the feed gives it. */
export function countryInfo(rawName) {
  const name = (rawName ?? "").trim() || "Unknown";
  const short = IOC[name.toLowerCase()] ?? (name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "UNK");
  return { name, short, color: PALETTE[hash(name) % PALETTE.length] };
}
