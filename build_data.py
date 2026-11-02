#!/usr/bin/env python3
"""Regenerate data.json from CSV exports of the Google Sheet tabs.

Usage: python3 build_data.py [csv_dir]   (default: ./data)
Expects roster.csv, meets.csv, results.csv, standards.csv (standards optional).
"""
import csv, json, os, re, sys
from datetime import datetime
from zoneinfo import ZoneInfo

SKIP = {"DNF", "DNS", "DQ", "NH", "FOUL", "NM", "NT", "SCR", ""}

def read(d, name):
    p = os.path.join(d, name)
    if not os.path.exists(p):
        return []
    with open(p, newline="", encoding="utf-8-sig") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]

def is_field(event):
    return bool(re.search(r"jump|vault|put|shot|discus|javelin|hammer", event, re.I))

GROUPS = ["Sprints", "Distance", "Hurdles", "Relays", "Jumps", "Throws"]

def gender_of(name, roster_gender):
    """Relay teams are named 'Boys A' / 'Girls B'; individuals use the roster."""
    m = re.match(r"^(Boys|Girls)\b", name)
    return m.group(1) if m else roster_gender.get(name, "")

def group(event):
    e = event.lower()
    if "hurdle" in e: return "Hurdles"
    if "relay" in e or "medley" in e or re.search(r"\dx\d", e): return "Relays"
    if re.search(r"jump|vault", e): return "Jumps"
    if re.search(r"put|shot|discus|javelin|hammer", e): return "Throws"
    m = re.match(r"(\d+)", e)
    if m:
        return "Sprints" if int(m.group(1)) <= 400 else "Distance"
    return "Other"

def parse_mark(mark, event):
    """Return numeric value (seconds or inches) or None. Strips a/Q/R flags."""
    raw = mark.strip().upper()
    if raw in SKIP: return None
    if is_field(event):
        clean = re.sub(r"[AQR*#]+$", "", raw).strip()
    else:
        # track flags: a (FAT), q/Q (qualified), R (record), M (meet record), x (exhibition)
        clean = re.sub(r"(?<=\d)[AQRMX*#]+$", "", raw).strip()
    try:
        if is_field(event):
            m = re.match(r"^(\d+)-(\d+(?:\.\d+)?)$", clean)
            if m: return int(m.group(1)) * 12 + float(m.group(2))
            if "M" in clean: return float(clean.rstrip("M")) * 39.3701
            return float(clean)
        parts = clean.split(":")
        v = 0.0
        for p in parts: v = v * 60 + float(p)
        return v
    except ValueError:
        return None

def flags(mark):
    m = re.search(r"(?<=\d)([aqQRM]+)$", mark.strip())
    s = m.group(1) if m else ""
    return {"fat": "a" in s, "qualified": "Q" in s or "q" in s, "record": "R" in s or "M" in s}

def iso_date(note, season):
    m = re.match(r"(\d{1,2})/(\d{1,2})", note or "")
    if not m or not season.isdigit(): return None
    return f"{int(season):04d}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"

def split_location(loc, extra=""):
    """Location may carry a map link as a HYPERLINK formula, a bare URL, or a separate Map column."""
    m = re.match(r'^=HYPERLINK\(\s*"([^"]+)"\s*[,;]\s*"([^"]*)"\s*\)$', loc, re.I)
    if m: return m.group(2), m.group(1)
    u = re.search(r"https?://\S+", loc)
    if u: return (loc.replace(u.group(0), "").strip(" -|()") or loc), u.group(0)
    return loc, (extra if extra.startswith("http") else "")

def season_year(s):
    m = re.search(r"\d{4}", s or "")
    return m.group(0) if m else ""

def main():
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    roster = read(d, "roster.csv")
    meets_raw = read(d, "meets.csv")
    results_raw = read(d, "results.csv")
    standards = [s for s in read(d, "standards.csv") if any(s.values())]

    athletes = [{
        "name": r["Athlete"], "grade": r.get("Grade", ""), "gender": r.get("Gender", ""),
        "events": [e.strip() for e in r.get("Events", "").split(",") if e.strip()],
        "coach": r.get("Event Group Coach", ""), "notes": r.get("Notes", ""),
    } for r in roster if r.get("Athlete")]

    meets = []
    for m in meets_raw:
        if not m.get("Meet / Event"): continue
        season = m.get("Season", "")
        loc_text, map_url = split_location(m.get("Location", ""), m.get("Map", "") or m.get("Map URL", ""))
        meets.append({
            "day": m.get("Day", ""), "date": iso_date(m.get("Date", ""), season_year(season)),
            "status": m.get("Results", ""), "time": m.get("Time", ""),
            "name": m["Meet / Event"], "location": loc_text, "mapUrl": map_url, "season": season,
        })
    meets.sort(key=lambda x: (x["date"] or "9999", x["name"]))

    roster_gender = {a["name"]: a["gender"] for a in athletes}
    results = []
    for r in results_raw:
        if not r.get("Athlete"): continue
        ev, mark, season = r.get("Event", ""), r.get("Mark", ""), r.get("Season", "")
        results.append({
            "meet": r.get("Meet Name", ""), "athlete": r["Athlete"], "event": ev,
            "group": group(ev), "field": is_field(ev), "relay": group(ev) == "Relays",
            "gender": gender_of(r["Athlete"], roster_gender), "mark": mark,
            "value": parse_mark(mark, ev), **flags(mark),
            "place": r.get("Place", ""), "round": r.get("Round", ""), "wind": r.get("Wind", ""),
            "dateLabel": r.get("Notes", ""), "date": iso_date(r.get("Notes", ""), season_year(season)),
            "season": season, "enteredBy": r.get("Entered By", ""), "notes": r.get("Notes", ""),
        })

    # Season-specific grades: grade_in_season = base_grade - (base_season - season).
    # Base season comes from Roster Notes ("Grade as of 2026 (MileSplit)"); defaults to the latest season.
    # A per-result "grade" field (MileSplit per-meet grade), if present, takes precedence.
    all_seasons = sorted({season_year(r["season"]) for r in results if season_year(r["season"])})
    for a in athletes:
        m = re.search(r"as of (\d{4})", a.get("notes") or "")
        base_season = int(m.group(1)) if m else (int(all_seasons[-1]) if all_seasons else None)
        try: base = int(str(a.get("grade") or "").strip())
        except ValueError: base = None
        gmap = {}
        for se in all_seasons:
            per = [r.get("grade") for r in results if r["athlete"] == a["name"] and r["season"] == se and str(r.get("grade") or "").isdigit()]
            g = int(per[0]) if per else (base - (base_season - int(se)) if base is not None and base_season else None)
            if g is not None and 9 <= g <= 12: gmap[se] = str(g)
        a["gradeBySeason"] = gmap
        a["baseSeason"] = str(base_season) if base_season else ""

    out = {
        "team": "Golden View Classical Academy",
        "generated": datetime.now(ZoneInfo("America/Denver")).isoformat(timespec="minutes"),
        "groups": GROUPS,
        "seasons": sorted({season_year(r["season"]) for r in results if season_year(r["season"])}),
        "athletes": athletes, "meets": meets, "results": results, "standards": standards,
    }
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")
    with open(dst, "w") as f: json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {dst}: {len(athletes)} athletes, {len(meets)} meets, {len(results)} results, {len(standards)} standards")
    from collections import Counter
    print("  by season:", dict(sorted(Counter(r["season"] for r in results).items())))
    print("  by group:", dict(Counter(r["group"] for r in results)))
    bad = [r for r in results if r["value"] is None and r["mark"].upper() not in SKIP]
    if bad: print("  WARNING unparsed marks:", [(r["athlete"], r["event"], r["mark"]) for r in bad][:20])

if __name__ == "__main__":
    main()
