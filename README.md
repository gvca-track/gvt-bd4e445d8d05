# Golden View Track & Field — Season Tracker

Static site (plain HTML/CSS/JS, no build step) for Golden View Classical Academy track & field.
Chart.js and Google Fonts load from CDNs.

## Files
- `index.html`, `styles.css`, `app.js`: the site. `app.js` loads `data.json` and renders everything.
- `records.html`, `records.js`, `records.css`: the School Records page (records, all-time top 20, by grade/class, most improved, single-season bests). Computed in the browser from the same `data.json`.
- `tips.js`: shared tap/hover tooltips for both pages.
- `data.json`: generated data. Don't edit by hand.
- `build_data.py`: turns CSV exports of the Google Sheet into `data.json`.
- `data/roster.csv`, `data/meets.csv`, `data/results.csv`, `data/standards.csv`: the CSV exports.

## Refreshing the data
1. In the Google Sheet, export each tab as CSV (File → Download → Comma-separated values) for
   **Roster**, **Meets**, **Results** and **Standards**.
2. Save them in `data/` as `roster.csv`, `meets.csv`, `results.csv` and `standards.csv`, replacing the old files.
   Keep the header row and column names the same.
3. Run `python3 build_data.py` (Python 3.9+, no extra packages). It rewrites `data.json` and stamps
   the "Last updated" time in America/Denver.
4. Commit `data/` and `data.json`. Nothing else needs to change.

## Historical (pre-2017) records
Add rows to the **Historical Records** tab of the team sheet (Event, Gender, Athlete, Mark, Year, Meet, Notes),
export it as `data/historical_records.csv`, and run `python3 build_data.py`. Notes may hold `Grade 12`, relay runners,
`hand-timed` (or end the mark with `h`), or `wind +2.4`. Rows merge into school records and top-20 lists, tagged HIST.

## How marks work
- Suffixes `a` (electronic/FAT timing), `Q` (qualified) and `R` (record) are stripped before comparing.
- Running events: lower is better (`12.36`, `1:04.35`). Field events (`18-04.5` feet-inches): higher is better.
- Records page: hand-timed marks (`hand-timed` in Notes) rank with +0.24s (under 400m) / +0.14s (400m+) and show `h`;
  wind over +2.0 (or `wind-aided` in Notes) shows `w` and is excluded from records/lists.
- `DNF`, `DNS`, `DQ`, `NH`, `FOUL` are shown in meet results but never count as bests.
- The **Results** `Notes` column holds the meet date (`MM/DD` or `MM/DD-MM/DD`), and `Season` gives the year.

## Sections that turn on automatically
- **Season Comparison** shows when the Results tab has marks from two or more seasons (e.g. 2026 and 2027).
  The PR board and profiles always use the most recent season.
- **Qualifying Standards** shows when the Standards tab has rows.
- Results and Schedule hide when their tabs are empty.

## Previewing locally
`fetch()` won't load `data.json` from `file://`, so serve the folder over HTTP:
```
python3 -m http.server 8000   # then open http://localhost:8000
```
On GitHub Pages it works as-is from the repo root.
