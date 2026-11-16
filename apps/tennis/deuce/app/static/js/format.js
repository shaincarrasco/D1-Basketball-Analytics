// Formatting helpers. All times are shown in the browser's local time zone.

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const dateYearFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export const parseDate = (iso) => (iso ? new Date(iso) : null);

export function localDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayLabel(key) {
  const today = new Date();
  const k0 = localDayKey(today);
  const t = new Date(today); t.setDate(t.getDate() + 1);
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (key === k0) return "Today";
  if (key === localDayKey(t)) return "Tomorrow";
  if (key === localDayKey(y)) return "Yesterday";
  const [yy, mm, dd] = key.split("-").map(Number);
  return dayFmt.format(new Date(yy, mm - 1, dd));
}

export const time = (iso) => (iso ? timeFmt.format(new Date(iso)) : "");
export const shortDate = (iso) => (iso ? dateFmt.format(new Date(iso.length === 10 ? iso + "T12:00:00" : iso)) : "");
export const longDate = (iso) => (iso ? dateYearFmt.format(new Date(iso.length === 10 ? iso + "T12:00:00" : iso)) : "");

export function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${time(iso)}, ${dateFmt.format(d)}`;
}

export const pct = (p, digits = 0) => (p === null || p === undefined || Number.isNaN(p) ? "–" : (p * 100).toFixed(digits));
export const odds = (o) => (o ? Number(o).toFixed(2) : "–");

export function signed(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const v = Number(n).toFixed(digits);
  if (Number(v) === 0) return Number(0).toFixed(digits);
  return n > 0 ? `+${v}` : `−${v.replace("-", "")}`;
}

// Edge (0.061) -> "6.1 pts"
export const pts = (edge) => `${signed(edge * 100, 1)} pts`;

export function money(n, digits = 0) {
  const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (Math.abs(n) < 0.5 * 10 ** -digits) return `$${abs}`;
  return n >= 0 ? `+$${abs}` : `−$${abs}`;
}

export const int = (n) => (n === null || n === undefined ? "–" : Math.round(n).toLocaleString());

// Values that arrive inside brief facts or features: keep strings, tidy numbers.
export function factValue(v) {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : String(Number(v.toFixed(2)));
  }
  return String(v);
}

export function surfaceLabel(s) {
  if (!s) return null;
  const t = String(s).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function lastName(name) {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  // Keep particles with the surname: "de Minaur", "van de Zandschulp".
  const particles = new Set(["de", "da", "del", "van", "von", "der", "di", "le", "la", "dos"]);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(" ");
}

export function engineLabel(engine) {
  if (!engine) return "Rules-based brief";
  const e = String(engine);
  if (e.startsWith("llm:")) return `Written by local model ${e.slice(4)}`;
  if (e.startsWith("llm")) return "Written by a local model";
  return "Rules-based brief";
}

// Country names from ESPN arrive in full ("Italy"); rows show a three-letter code.
const IOC = {
  "argentina": "ARG", "australia": "AUS", "austria": "AUT", "belarus": "BLR", "belgium": "BEL", "bolivia": "BOL",
  "bosnia and herzegovina": "BIH", "brazil": "BRA", "bulgaria": "BUL", "canada": "CAN", "chile": "CHI", "china": "CHN",
  "chinese taipei": "TPE", "taiwan": "TPE", "colombia": "COL", "croatia": "CRO", "cyprus": "CYP", "czechia": "CZE",
  "czech republic": "CZE", "denmark": "DEN", "ecuador": "ECU", "egypt": "EGY", "estonia": "EST", "finland": "FIN",
  "france": "FRA", "georgia": "GEO", "germany": "GER", "great britain": "GBR", "united kingdom": "GBR", "greece": "GRE",
  "hong kong": "HKG", "hungary": "HUN", "india": "IND", "indonesia": "INA", "ireland": "IRL", "israel": "ISR",
  "italy": "ITA", "japan": "JPN", "kazakhstan": "KAZ", "korea": "KOR", "south korea": "KOR", "latvia": "LAT",
  "lithuania": "LTU", "luxembourg": "LUX", "mexico": "MEX", "moldova": "MDA", "monaco": "MON", "montenegro": "MNE",
  "morocco": "MAR", "netherlands": "NED", "new zealand": "NZL", "norway": "NOR", "paraguay": "PAR", "peru": "PER",
  "philippines": "PHI", "poland": "POL", "portugal": "POR", "puerto rico": "PUR", "romania": "ROU", "russia": "RUS",
  "serbia": "SRB", "slovakia": "SVK", "slovenia": "SLO", "south africa": "RSA", "spain": "ESP", "sweden": "SWE",
  "switzerland": "SUI", "thailand": "THA", "tunisia": "TUN", "turkey": "TUR", "türkiye": "TUR", "ukraine": "UKR",
  "united states": "USA", "usa": "USA", "uruguay": "URU", "uzbekistan": "UZB", "venezuela": "VEN", "lebanon": "LBN",
};
export function countryCode(c) {
  if (!c) return null;
  const t = String(c).trim();
  if (t.length <= 3) return t.toUpperCase();
  return IOC[t.toLowerCase()] || null;
}

export function levelLabel(level, tour) {
  if (!level) return null;
  const l = String(level).trim();
  if (/^\d+$/.test(l)) return `${tour ? String(tour).toUpperCase() + " " : ""}${l}`;
  return l;
}

export function splitName(n, i) {
  if (n === null || n === undefined || n === "") return `Split ${i + 1}`;
  const m = String(n).match(/^split\s*_?(\d+)$/i);
  if (m) return `Split ${m[1]}`;
  if (typeof n === "number") return `Split ${n}`;
  return String(n);
}
