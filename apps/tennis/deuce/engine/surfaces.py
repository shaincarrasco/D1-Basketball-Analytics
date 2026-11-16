"""Curated tournament -> surface/level mapping for ATP + WTA singles events seen on ESPN.

Matching uses accent-stripped keywords on the event name first, then on every comma-separated part of the
venue string (city). Unknown events fall back to ("Hard", inferred=True).
"""
from __future__ import annotations

import re
import unicodedata

HARD, CLAY, GRASS, INDOOR = "Hard", "Clay", "Grass", "Indoor Hard"


def _norm(text: str | None) -> str:
    t = unicodedata.normalize("NFKD", text or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


# --- name keyword rules: (keywords any-match, tour or None, surface). First match wins.
_NAME_RULES: list[tuple[tuple[str, ...], str | None, str]] = [
    (("wimbledon",), None, GRASS),
    (("roland garros", "french open"), None, CLAY),
    (("us open",), None, HARD),
    (("australian open",), None, HARD),
    (("nitto atp finals", "atp finals", "next gen atp finals", "next gen finals", "wta finals", "wta elite trophy",
      "laver cup", "davis cup finals"), None, INDOOR),
    (("united cup", "atp cup", "hopman"), None, HARD),
    (("olympics",), None, CLAY),  # Paris 2024 (Roland Garros); other years would need a rule
    (("hsbc championships", "queen s club", "cinch championships"), None, GRASS),
    (("boss open", "terra wortmann", "libema", "lexus eastbourne", "lexus birmingham", "lexus nottingham",
      "lexus ilkley", "bad homburg", "mallorca", "hall of fame open", "rothesay"), None, GRASS),
    (("berlin tennis open",), "WTA", GRASS),
    (("jamor indoor",), None, INDOOR),
    (("indoor", "indoors"), None, INDOOR),
    (("swiss indoors", "erste bank open", "rolex paris masters", "bybit stockholm", "stockholm open",
      "bnp paribas fortis european open", "abn amro", "moselle open", "open occitanie", "sofia open",
      "upper austria ladies linz", "ostrava open", "open bls de limoges", "open angers", "open capfinances rouen",
      "grand prix auvergne rhone alpes", "transylvania open"), None, INDOOR),
    (("internazionali bnl", "mutua madrid", "monte carlo", "barcelona open", "bmw open", "hamburg", "gonet geneva",
      "generali open", "plava laguna", "efg swiss open", "nordea open", "tiriac", "bci seguros chile", "rio open",
      "ieb argentina", "cordoba open", "hassan ii", "millennium estoril", "srpska open", "belgrade open",
      "u s men s clay", "credit one charleston", "porsche tennis grand prix", "internationaux de strasbourg",
      "palermo ladies", "prague open", "lalla meryem", "colsanitas", "kia open", "makarska", "solgirones",
      "saint malo", "grand est open", "ladies open lausanne", "hungarian grand prix", "warsaw", "iasi",
      "ljubljana", "megasaray", "engie open", "copa oster", "reto win", "cali open", "lp open", "veneto open",
      "open delle puglie", "citta di grado", "valencia", "firenze", "parma ladies", "montevideo", "bolivia open",
      "quito open", "tucuman", "directv open", "curitiba", "sp open", "trophee clarins", "eupago porto",
      "figueira da foz", "caldas da rainha", "oeiras", "dubrovnik", "banorte", "queretaro", "san sebastian",
      "andorra", "memorial eugenio", "internazionali di calabria", "internazionali femminili", "tolentino",
      "atv bancomat", "roveretopen", "lisboa belem", "samsun", "istanbul open", "enka open", "ankara open",
      "atik antalya", "adana open", "villa de madrid", "sables d olonne", "axeria", "jiangxi open"), None, CLAY),
]
# jiangxi is hard; fixed below via explicit hard overrides

_HARD_OVERRIDES = ("jiangxi open", "dow tennis classic", "valle d aosta", "mubadala citi dc", "nexo dallas")

# --- venue city / segment -> surface (used when name rules do not match)
_CITY: dict[str, str] = {}


def _add(surface: str, *cities: str) -> None:
    for c in cities:
        _CITY[_norm(c)] = surface


_add(GRASS, "s-Hertogenbosch", "Bad Homburg", "Birmingham", "Eastbourne", "Halle", "Ilkley", "Mallorca", "Newport",
     "Nottingham", "London", "Hurlingham")
_add(CLAY, "Barcelona", "Bastad", "Bucharest", "Buenos Aires", "Bogota", "Cordoba", "Estoril", "Geneva", "Gstaad",
     "Hamburg", "Houston", "Kitzbuhel", "Madrid", "Marrakech", "Monte-Carlo", "Munich", "Rabat", "Rio de Janeiro",
     "Rome", "Santiago", "Umag", "Belgrade", "Banja Luka", "Charleston", "Paris", "Strasbourg", "Palermo", "Parma",
     "Prague", "Lausanne", "Warsaw", "Budapest", "Iasi", "Lleida", "La Bisbal d'Emporda", "Reus", "Contrexeville",
     "Saint-Malo", "Makarska", "Cali", "Bari", "Foggia", "Gaiba", "Grado", "Rende", "Tolentino", "Lisboa", "Oeiras",
     "Porto", "Figueira Da Foz", "Dubrovnik", "Curitiba", "Florianopolis", "Sao Paulo", "Montevideo", "Colina",
     "Santa Cruz", "Quito", "Tucuman", "Sopo", "Barranquilla", "Valencia", "San Sebastian", "Modena", "Brescia",
     "Florence", "Samsun", "Istanbul", "Antalya", "Ankara", "Adana", "San Luis Potosi", "Santiago de Queretaro",
     "Ljubljana", "Andorra", "Montreux", "Lyon", "Stuttgart:WTA", "Caldas da Rainha", "Les Sables d'Olonne", "Cluj-Napoca:W26")
_add(GRASS, "Stuttgart:ATP", "Berlin:WTA")
_add(INDOOR, "Rotterdam", "Marseille", "Montpellier", "Metz", "Antwerp", "Brussels", "Basel", "Vienna", "Stockholm",
     "Sofia", "Astana", "Almaty", "Linz", "Ostrava", "Luxembourg", "Limoges", "Angers", "Rouen", "Courmayeur", "Cluj-Napoca",
     "Turin", "Jeddah", "Riyadh", "Midland", "Memphis", "Philadelphia", "Dallas", "Rovereto", "Zhuhai:INDOOR_X")
_add(HARD, "Auckland", "Adelaide", "Brisbane", "Melbourne", "Canberra", "Hobart", "Pune", "Chennai", "Mumbai",
     "Hong Kong", "Doha", "Dubai", "Abu Dhabi", "Indian Wells", "Miami", "Acapulco", "Los Cabos", "Delray Beach",
     "Washington", "Atlanta", "Winston-Salem", "Cincinnati", "Toronto", "Montreal", "Vancouver", "New York",
     "San Diego", "Stanford", "Austin", "Cleveland", "Beijing", "Shanghai", "Chengdu", "Hangzhou", "Wuhan", "Ningbo",
     "Guangzhou", "Huzhou", "Jiujiang", "Jiangxi", "Jingshan", "Changsha", "Suzhou", "Zhengzhou", "Nanchang", "Jinan",
     "Seoul", "Tokyo", "Osaka", "Singapore", "Manila", "Luanda", "Hua Hin", "Monastir", "Tampico", "Merida", "Monterrey",
     "Guadalajara", "Puerto Vallarta", "Nuevo Vallarta", "Cancun", "Mexico City", "Zhuhai")

# --- level rules
_SLAMS = ("australian open", "roland garros", "wimbledon", "us open")
_FINALS = ("atp finals", "next gen", "wta finals", "elite trophy", "laver cup", "davis cup finals")
_OTHER = ("olympics", "united cup", "atp cup", "hopman", "billie jean", "davis cup", "exhibition")
_ATP_1000 = ("bnp paribas open", "miami open", "monte carlo", "mutua madrid", "internazionali bnl", "omnium banque",
             "cincinnati", "rolex shanghai", "rolex paris masters")
_ATP_500 = ("abn amro", "dubai duty free", "abierto mexicano", "rio open", "barcelona open", "terra wortmann",
            "hsbc championships", "hamburg open", "mubadala citi dc", "china open", "kinoshita group japan open tennis",
            "swiss indoors", "erste bank open", "qatar exxonmobil")
_ATP_500_2025 = ("nexo dallas", "bmw open")
_WTA_1000 = ("bnp paribas open", "miami open", "mutua madrid", "internazionali bnl", "omnium banque", "cincinnati",
             "china open", "wuhan open")
_WTA_500 = ("adelaide international", "brisbane international", "mubadala abu dhabi", "credit one charleston",
            "porsche tennis grand prix", "upper austria ladies linz", "lexus eastbourne", "berlin tennis open",
            "bad homburg", "cymbiotika san diego", "mubadala citi dc", "toray pan pacific", "ningbo open", "ostrava open",
            "guadalajara open", "abierto gnp", "merida open", "msc hamburg", "internationaux de strasbourg",
            "the hsbc championships")
_WTA_250 = ("asb classic", "hobart", "thailand open", "atx open", "colsanitas", "rabat", "lalla meryem",
            "open capfinances rouen", "grand est open", "lexus nottingham", "lexus birmingham", "ladies open lausanne",
            "prague open", "palermo", "warsaw", "hungarian grand prix", "iasi", "transylvania", "jasmin open",
            "jiangxi", "guangzhou", "prudential hong kong", "parma ladies", "tennis in the land", "nordea open",
            "libema", "open 6eme sens", "lyon", "golden gate", "abierto tampico", "kia open", "copa oster",
            "mumbai open", "ilkley", "wuhan", "chennai open", "hellenic", "athens open", "tiriac foundation",
            "ljubljana", "korea open", "kinoshita group japan open")


def guess_surface(name: str | None, tour: str | None = None, year: int | None = None,
                  venue: str | None = None) -> tuple[str, bool]:
    """Return (surface, inferred). inferred=True means no rule matched and 'Hard' was assumed."""
    n = _norm(name)
    t = (tour or "").upper()
    if any(k in n for k in _HARD_OVERRIDES):
        return HARD if "dow tennis" not in n and "valle d aosta" not in n and "dallas" not in n else INDOOR, False
    for kws, tr, surface in _NAME_RULES:
        if tr and tr != t:
            continue
        if any(re.search(rf"\b{re.escape(k)}\b", n) for k in kws):
            return surface, False
    for seg in [s for s in (venue or "").split(",")]:
        key = _norm(seg)
        for k in (f"{key}:{t}", key):
            if k in _CITY:
                return _CITY[k], False
    return HARD, True


def guess_level(name: str | None, tour: str | None = None, major: bool = False, year: int | None = None) -> str:
    """Grand Slam / 1000 / 500 / 250 / 125 / Finals / Other."""
    n = _norm(name)
    t = (tour or "").upper()
    if any(k in n for k in _SLAMS) and "next gen" not in n:
        return "Grand Slam"
    if any(k in n for k in _FINALS):
        return "Finals"
    if any(k in n for k in _OTHER):
        return "Other"
    if re.search(r"\b125\b", n):
        return "125"
    if t == "ATP":
        if any(k in n for k in _ATP_1000):
            return "1000"
        if any(k in n for k in _ATP_500) or (any(k in n for k in _ATP_500_2025) and (year or 2025) >= 2025):
            return "500"
        return "250"
    if any(k in n for k in _WTA_1000):
        if "wuhan" in n and False:
            return "1000"
        return "1000"
    if "qatar ladies" in n or "dubai duty free" in n:
        return "1000"
    if any(k in n for k in _WTA_500):
        return "500"
    if any(k in n for k in _WTA_250):
        return "250"
    return "125"
