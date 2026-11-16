"""Country normalisation so player flags ("USA", "Great Britain") match venue strings ("... United States")."""
from __future__ import annotations

# canonical key -> aliases (all lowercase). The canonical key is also an alias.
_GROUPS: dict[str, list[str]] = {
    "usa": ["usa", "us", "united states", "united states of america", "u.s.a."],
    "gbr": ["gbr", "great britain", "united kingdom", "uk", "england", "scotland", "wales", "britain"],
    "chn": ["chn", "china", "china pr", "hong kong, china", "hong kong", "hkg", "pr china", "people's republic of china"],
    "tpe": ["tpe", "chinese taipei", "taiwan", "tpo"],
    "kor": ["kor", "south korea", "korea", "korea republic", "republic of korea", "korea, republic of"],
    "rus": ["rus", "russia", "russian federation"],
    "cze": ["cze", "czech republic", "czechia"],
    "uae": ["uae", "united arab emirates", "are"],
    "ned": ["ned", "netherlands", "the netherlands", "holland", "nld"],
    "ger": ["ger", "germany", "deu"],
    "sui": ["sui", "switzerland", "che"],
    "esp": ["esp", "spain"],
    "fra": ["fra", "france"],
    "ita": ["ita", "italy"],
    "aus": ["aus", "australia"],
    "nzl": ["nzl", "new zealand"],
    "can": ["can", "canada"],
    "bra": ["bra", "brazil"],
    "arg": ["arg", "argentina"],
    "chi": ["chi", "chile", "chl"],
    "col": ["col", "colombia"],
    "mex": ["mex", "mexico"],
    "jpn": ["jpn", "japan"],
    "ind": ["ind", "india"],
    "kaz": ["kaz", "kazakhstan"],
    "uzb": ["uzb", "uzbekistan"],
    "qat": ["qat", "qatar"],
    "ksa": ["ksa", "saudi arabia", "sau"],
    "tur": ["tur", "turkey", "turkiye", "türkiye"],
    "cro": ["cro", "croatia", "hrv"],
    "srb": ["srb", "serbia"],
    "bul": ["bul", "bulgaria"],
    "rou": ["rou", "romania", "rom"],
    "pol": ["pol", "poland"],
    "hun": ["hun", "hungary"],
    "aut": ["aut", "austria"],
    "bel": ["bel", "belgium"],
    "swe": ["swe", "sweden"],
    "nor": ["nor", "norway"],
    "den": ["den", "denmark", "dnk"],
    "fin": ["fin", "finland"],
    "por": ["por", "portugal", "prt"],
    "gre": ["gre", "greece", "grc"],
    "isr": ["isr", "israel"],
    "mon": ["mon", "monaco", "mco"],
    "lat": ["lat", "latvia", "lva"],
    "ltu": ["ltu", "lithuania", "lit"],
    "est": ["est", "estonia"],
    "svk": ["svk", "slovakia"],
    "slo": ["slo", "slovenia", "svn"],
    "bih": ["bih", "bosnia and herzegovina", "bosnia & herzegovina"],
    "mne": ["mne", "montenegro"],
    "mkd": ["mkd", "north macedonia", "macedonia"],
    "geo": ["geo", "georgia"],
    "ukr": ["ukr", "ukraine"],
    "blr": ["blr", "belarus"],
    "irl": ["irl", "ireland"],
    "rsa": ["rsa", "south africa", "zaf"],
    "egy": ["egy", "egypt"],
    "mar": ["mar", "morocco"],
    "tun": ["tun", "tunisia"],
    "ecu": ["ecu", "ecuador"],
    "per": ["per", "peru"],
    "uru": ["uru", "uruguay"],
    "bol": ["bol", "bolivia"],
    "par": ["par", "paraguay"],
    "ven": ["ven", "venezuela"],
    "dom": ["dom", "dominican republic"],
    "pur": ["pur", "puerto rico"],
    "tha": ["tha", "thailand"],
    "idn": ["idn", "indonesia", "ina"],
    "phi": ["phi", "philippines", "phl"],
    "sgp": ["sgp", "singapore"],
    "mas": ["mas", "malaysia", "mys"],
    "vie": ["vie", "vietnam"],
    "lbn": ["lbn", "lebanon", "lib"],
    "cyp": ["cyp", "cyprus"],
    "lux": ["lux", "luxembourg"],
    "isl": ["isl", "iceland"],
    "mda": ["mda", "moldova"],
    "arm": ["arm", "armenia"],
    "aze": ["aze", "azerbaijan"],
    "bah": ["bah", "bahrain", "brn"],
    "jor": ["jor", "jordan"],
    "kuw": ["kuw", "kuwait"],
}
_ALIAS: dict[str, str] = {}
for _k, _al in _GROUPS.items():
    for _a in _al:
        _ALIAS[_a] = _k


def norm_country(value: str | None) -> str | None:
    """Return a canonical lowercase country key, or None when unknown/blank."""
    if not isinstance(value, str) or not value:
        return None
    v = value.strip().lower()
    if not v:
        return None
    if v in _ALIAS:
        return _ALIAS[v]
    return v


def venue_country(venue: str | None) -> str | None:
    """Country of a venue string like 'Auckland, New Zealand' or 'Indian Wells, CA, USA' (last comma part)."""
    if not venue:
        return None
    parts = [p.strip() for p in venue.split(",") if p.strip()]
    if not parts:
        return None
    if len(parts) >= 2 and ", ".join(parts[-2:]).lower() in _ALIAS:  # "Hong Kong, China"
        return parts[-1]
    return parts[-1]


def code3(value: str | None) -> str | None:
    """Three-letter country code (IOC-style, as the canonical keys above) or None when unknown."""
    k = norm_country(value)
    return k.upper() if k and len(k) == 3 and k.isalpha() else None
