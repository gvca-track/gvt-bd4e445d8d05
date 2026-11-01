# Golden View Track & Field — Season Tracker

Static site (plain HTML/CSS/JS, no build step) for Golden View Classical Academy track & field.
Chart.js and Google Fonts load from CDNs.

## Files
- `index.html`, `styles.css`, `app.js`: the site. `app.js` loads `data.json` and renders everything.
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

## How marks work
- Suffixes `a` (electronic/FAT timing), `Q` (qualified) and `R` (record) are stripped before comparing.
- Running events: lower is better (`12.36`, `1:04.35`). Field events (`18-04.5` feet-inches): higher is better.
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
