// School Records page: derives records, top-20 lists and granular views from data.json (same data as the season tracker).
(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let data;
  try { data = await (await fetch("data.json", { cache: "no-store" })).json(); }
  catch (e) { $("#recordsTable").innerHTML = '<tr><td class="empty">Could not load data.json.</td></tr>'; return; }

  const ORDER = ["100m", "200m", "400m", "800m", "1600m", "3200m", "100m Hurdles", "110m Hurdles", "300m Hurdles",
    "4x100 Relay", "4x200 Relay", "4x400 Relay", "4x800 Relay", "Sprint Medley Relay",
    "High Jump", "Pole Vault", "Long Jump", "Triple Jump", "Shot Put", "Discus"];
  const SKIP = new Set(["DNF", "DNS", "DQ", "NH", "FOUL", "NM", "NT", "SCR", ""]);
  const seasons = data.seasons || [];
  const CUR = seasons[seasons.length - 1] || "";
  const first = seasons[0] || "2017";
  const ath = Object.fromEntries((data.athletes || []).map((a) => [a.name, a]));
  const curAthletes = new Set((data.results || []).filter((r) => r.season === CUR && !r.relay).map((r) => r.athlete));

  const legDist = (ev) => { const m = ev.match(/(\d+)x(\d+)/i); if (m) return +m[2]; if (/medley/i.test(ev)) return 800; const n = ev.match(/^(\d+)/); return n ? +n[1] : 0; };
  const handAdj = (ev) => (legDist(ev) < 400 ? 0.24 : 0.14);
  const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  const runnersOf = (notes) => (notes || "").split(";").slice(1).map((s) => s.trim())
    .find((s) => s.includes(",") && !/exhibition|hand|wind|runners not listed|no mark/i.test(s)) || "";

  const norm = (r, hist) => {
    if (r.value == null || SKIP.has(String(r.mark).trim().toUpperCase())) return null;
    const notes = r.notes || "";
    const hand = !r.field && (hist ? r.handTimed : /hand-timed/i.test(notes));
    const w = parseFloat(r.wind);
    const windy = (!isNaN(w) && w > 2.0) || /wind-aided/i.test(notes);
    const grade = hist ? r.grade : (r.relay ? "" : ath[r.athlete]?.gradeBySeason?.[r.season] || "");
    return {
      ...r, hist: !!hist, hand, windy, exh: /exhibition/i.test(notes), grade,
      rank: hand ? +(r.value + handAdj(r.event)).toFixed(2) : r.value,
      runners: r.relay ? (hist ? notes : runnersOf(notes)) : "",
      disp: String(r.mark).replace(/(\d)[aqQRMxX*#]+$/, "$1"),
    };
  };
  const all = [...(data.results || []).map((r) => norm(r, false)), ...(data.historical || []).map((r) => norm(r, true))]
    .filter((p) => p && (p.gender === "Boys" || p.gender === "Girls"));
  // Sanity checks: field marks must be feet-inches (bare decimals like "6.50" are place/points that slipped into the
  // mark column), and track marks under 60% of the event's median time are timing/entry errors (e.g. "1.25" in a 1600m).
  const med = {}; all.forEach((p) => { (med[p.gender + p.event] ||= []).push(p.value); });
  Object.keys(med).forEach((k) => { const v = med[k].sort((a, b) => a - b); med[k] = v[Math.floor(v.length / 2)]; });
  const bogus = (p) => p.field ? (!p.hist && !/^\d+-\d/.test(p.disp) && !/m$/i.test(p.disp)) : p.value < med[p.gender + p.event] * 0.6;
  const excluded = all.filter(bogus);
  all.forEach((p) => { p.odd = p.field && /-\d+\.(\d+)$/.test(p.disp) && !/\.(0|00|25|5|50|75)$/.test(p.disp); });
  const legal = all.filter((p) => !p.windy && !bogus(p));
  const better = (a, b) => (a.field ? b.rank - a.rank : a.rank - b.rank) || (a.date || "").localeCompare(b.date || "");
  const events = ORDER.filter((e) => all.some((p) => p.event === e)).concat([...new Set(all.map((p) => p.event))].filter((e) => !ORDER.includes(e)).sort());
  const groupOf = (e) => all.find((p) => p.event === e)?.group || "";

  const tag = (cls, txt, tip) => `<span class="tag ${cls}" data-tip="${esc(tip)}" tabindex="0" role="button" aria-label="${esc(txt)}: ${esc(tip)}">${esc(txt)}</span>`;
  const markHtml = (p) => esc(p.disp) +
    (p.hand ? tag("h", "h", `Hand-timed. Ranked as ${fmtRank(p)} (+${handAdj(p.event).toFixed(2)}s FAT conversion)`) : "") +
    (p.windy ? tag("w", "w", `Wind-aided (${p.wind ? "+" + String(p.wind).replace(/^\+/, "") + " m/s" : "> +2.0"}): not record-eligible`) : "") +
    (p.fat && !p.hand ? tag("a", "FAT", "Fully automatic timing") : "") +
    (p.exh ? tag("x", "x", "Exhibition / non-scoring entry (legal mark)") : "") +
    (p.odd ? tag("odd", "?", "Unusual inch fraction in the results file: please verify this mark") : "") +
    (p.hist ? tag("H", "HIST", "Historical record entered by the coach (pre-MileSplit)") : "");
  const fmtRank = (p) => { const v = p.rank; if (p.field) return p.disp; const m = Math.floor(v / 60), s = (v - m * 60).toFixed(2); return m ? `${m}:${s.padStart(5, "0")}` : s; };
  const who = (p) => p.relay ? `${esc(p.athlete)}<span class="sub">${esc(p.runners || "Runners not listed")}</span>`
    : `${esc(p.athlete)}${curAthletes.has(p.athlete) ? " " + tag("now", CUR, `Competing in the ${CUR} season`) : ""}`;
  const gradeTxt = (p) => p.grade ? (/^\d+$/.test(p.grade) ? p.grade + "th" : p.grade) : "—";
  const meetCell = (p) => `${esc(p.meet || "—")}<span class="sub">${esc(p.date ? fmtDate(p.date) : p.season)}</span>`;
  const seg = (el, opts, val, on) => { el.innerHTML = opts.map((o) => `<button type="button" data-v="${esc(o)}" aria-pressed="${o === val}" class="${o === val ? "active" : ""}">${esc(o)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; [...el.children].forEach((c) => { c.classList.toggle("active", c === b); c.setAttribute("aria-pressed", c === b); }); on(b.dataset.v); }; };
  const bestPerAthlete = (list) => { const m = new Map(); list.forEach((p) => { const k = p.relay ? p.athlete + "|" + p.season + "|" + p.meet + "|" + p.rank : p.athlete; if (!m.has(k) || better(p, m.get(k)) < 0) m.set(k, p); }); return [...m.values()].sort(better); };
  const evList = (g, e, list = legal) => list.filter((p) => p.gender === g && p.event === e);

  $("#updated").textContent = data.generated ? "Last updated " + new Date(data.generated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  $("#rangePill").textContent = (data.historical || []).length ? "All-time records" : `${first}–${CUR}`;

  // 1. School records
  let recG = "Boys";
  const windNotes = [];
  const renderRecords = () => {
    windNotes.length = 0;
    let html = `<thead><tr><th>Event</th><th>Mark</th><th>Athlete</th><th class="hide-sm">Grade</th><th>Year</th><th class="hide-sm">Meet / Date</th></tr></thead><tbody>`, lastGrp = "";
    events.forEach((e) => {
      const best = evList(recG, e).sort(better)[0];
      if (!best) return;
      const g = groupOf(e); if (g !== lastGrp) { html += `<tr class="grp"><td colspan="6">${esc(g)}</td></tr>`; lastGrp = g; }
      html += `<tr class="${curAthletes.has(best.athlete) ? "cur" : ""}"><td class="ev">${esc(e)}</td><td class="mark">${markHtml(best)}</td><td class="who">${who(best)}</td><td class="hide-sm">${gradeTxt(best)}</td><td>${esc(best.season)}</td><td class="hide-sm">${meetCell(best)}</td></tr>`;
      const wbest = evList(recG, e, all).filter((p) => p.windy).sort(better)[0];
      if (wbest && better(wbest, best) < 0) windNotes.push(`${e}: ${wbest.disp}w by ${wbest.athlete} (${wbest.season}, wind ${wbest.wind || "> +2.0"})`);
    });
    $("#recordsTable").innerHTML = html + "</tbody>";
    $("#recFoot").textContent = "Wind-aided marks (> +2.0 m/s) are not record-eligible" + (windNotes.length ? ". Faster wind-aided marks not counted: " + windNotes.join(" · ") + "." : ".");
  };
  seg($("#recGender"), ["Boys", "Girls"], recG, (v) => { recG = v; renderRecords(); });
  renderRecords();

  // 2. Top 20
  const t20 = { e: events[0], g: "Boys" };
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  if (events.includes(params.get("event"))) t20.e = params.get("event");
  if (["Boys", "Girls"].includes(params.get("gender"))) t20.g = params.get("gender");
  const evSel = $("#t20Event");
  const optGroups = () => { let h = "", g = ""; events.forEach((e) => { const gg = groupOf(e); if (gg !== g) { if (g) h += "</optgroup>"; h += `<optgroup label="${esc(gg)}">`; g = gg; } h += `<option value="${esc(e)}">${esc(e)}</option>`; }); return h + "</optgroup>"; };
  evSel.innerHTML = optGroups(); evSel.value = t20.e;
  const renderTop20 = () => {
    const list = bestPerAthlete(evList(t20.g, t20.e)).slice(0, 20);
    $("#top20Table").innerHTML = list.length ? `<thead><tr><th>#</th><th>Mark</th><th>${list[0].relay ? "Team" : "Athlete"}</th><th>Year</th><th class="hide-sm">Grade</th><th class="hide-sm">Meet / Date</th></tr></thead><tbody>` +
      list.map((p, i) => `<tr class="${curAthletes.has(p.athlete) ? "cur" : ""}"><td class="rk"><span class="rkb">${i + 1}</span></td><td class="mark">${markHtml(p)}</td><td class="who">${who(p)}</td><td>${esc(p.season)}</td><td class="hide-sm">${gradeTxt(p)}</td><td class="hide-sm">${meetCell(p)}</td></tr>`).join("") + "</tbody>"
      : `<tbody><tr><td class="empty">No ${esc(t20.g.toLowerCase())} marks in this event yet.</td></tr></tbody>`;
  };
  evSel.onchange = () => { t20.e = evSel.value; renderTop20(); };
  seg($("#t20Gender"), ["Boys", "Girls"], t20.g, (v) => { t20.g = v; renderTop20(); });
  renderTop20();

  // 3. Granular views
  const indiv = events.filter((e) => groupOf(e) !== "Relays");
  const classOf = (p) => (p.grade && /^\d+$/.test(p.grade) && p.season ? String(+p.season + 12 - +p.grade) : "");
  const classes = [...new Set(legal.map(classOf).filter(Boolean))].sort().reverse();
  const st = { tab: "grade", e: indiv[0], g: "Boys", cls: classes.find((c) => +c >= +CUR) || classes[0], season: CUR, imp: "All events" };
  const TABS = [["grade", "Best by Grade"], ["class", "Class Year"], ["improved", "Most Improved"], ["season", "Single-Season Bests"]];
  $("#moreTabs").innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-k="${k}" aria-selected="${k === st.tab}">${l}</button>`).join("");
  $("#moreTabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; st.tab = b.dataset.k; [...$("#moreTabs").children].forEach((c) => c.setAttribute("aria-selected", c === b)); renderMore(); };
  const select = (id, opts, val, label) => `<label class="rec-select"><span class="sr-only">${label}</span><select id="${id}" aria-label="${label}">${opts.map((o) => `<option value="${esc(Array.isArray(o) ? o[0] : o)}"${(Array.isArray(o) ? o[0] : o) === val ? " selected" : ""}>${esc(Array.isArray(o) ? o[1] : o)}</option>`).join("")}</select></label>`;
  const table = (head, rows, empty) => rows.length ? `<div class="card table-wrap"><table class="rec-table"><thead><tr>${head.map((h) => `<th${h.startsWith("~") ? ' class="hide-sm"' : ""}>${esc(h.replace(/^~/, ""))}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<div class="card empty">${esc(empty)}</div>`;

  const renderMore = () => {
    const c = $("#moreControls"), b = $("#moreBody");
    if (st.tab === "grade") {
      c.innerHTML = select("mEvent", indiv, st.e, "Event") + '<div class="seg" id="mGender" role="group" aria-label="Gender"></div>';
      const lists = ["9", "10", "11", "12"].map((gr) => [gr, bestPerAthlete(evList(st.g, st.e).filter((p) => p.grade === gr)).slice(0, 5)]);
      b.innerHTML = `<div class="grade-grid">${lists.map(([gr, l]) => `<div class="card pr-event"><h3>${gr}th Grade <small>${esc(st.e)}</small></h3><table class="rec-table"><tbody>${l.length ? l.map((p, i) => `<tr class="${curAthletes.has(p.athlete) ? "cur" : ""}"><td class="rk"><span class="rkb">${i + 1}</span></td><td class="who">${who(p)}<span class="sub">${esc(p.season)} · ${esc(p.meet)}</span></td><td class="mark">${markHtml(p)}</td></tr>`).join("") : '<tr><td class="empty">No marks yet</td></tr>'}</tbody></table></div>`).join("")}</div>`;
    } else if (st.tab === "class") {
      c.innerHTML = select("mClass", classes.map((y) => [y, "Class of " + y]), st.cls, "Graduating class") + '<div class="seg" id="mGender" role="group" aria-label="Gender"></div>';
      const rows = indiv.map((e) => { const l = bestPerAthlete(evList(st.g, e).filter((p) => classOf(p) === st.cls)); return l.length ? `<tr><td class="ev">${esc(e)}</td><td class="mark">${markHtml(l[0])}</td><td class="who">${who(l[0])}</td><td>${esc(l[0].season)} <span class="muted">(${gradeTxt(l[0])})</span></td><td class="hide-sm">${l.slice(1, 3).map((p) => `${esc(p.athlete)} ${esc(p.disp)}${p.hand ? "h" : ""}`).join("<br>") || "—"}</td></tr>` : ""; }).filter(Boolean);
      b.innerHTML = table(["Event", "Best", "Athlete", "Year (grade)", "~Next best"], rows, `No ${st.g.toLowerCase()} marks for the Class of ${st.cls}.`);
    } else if (st.tab === "improved") {
      c.innerHTML = select("mImp", ["All events", ...indiv], st.imp, "Event") + '<div class="seg" id="mGender" role="group" aria-label="Gender"></div>';
      const sb = new Map();
      legal.filter((p) => !p.relay && !p.hist && p.gender === st.g && (st.imp === "All events" || p.event === st.imp)).forEach((p) => { const k = p.athlete + "|" + p.event + "|" + p.season; if (!sb.has(k) || better(p, sb.get(k)) < 0) sb.set(k, p); });
      const by = new Map(); [...sb.values()].forEach((p) => { const k = p.athlete + "|" + p.event; (by.get(k) || by.set(k, []).get(k)).push(p); });
      const imps = [];
      by.forEach((l) => { l.sort((a, b2) => a.season.localeCompare(b2.season)); for (let i = 1; i < l.length; i++) { const a = l[i - 1], z = l[i]; const pct = (z.field ? z.rank - a.rank : a.rank - z.rank) / a.rank * 100; if (pct > 0 && +z.season - +a.season <= 2) imps.push({ a, z, pct }); } });
      imps.sort((x, y) => y.pct - x.pct);
      const rows = imps.slice(0, 25).map(({ a, z, pct }, i) => `<tr class="${curAthletes.has(z.athlete) ? "cur" : ""}"><td class="rk"><span class="rkb">${i + 1}</span></td><td class="who">${who(z)}</td><td>${esc(z.event)}</td><td class="hide-sm">${esc(a.season)}: ${markHtml(a)}</td><td>${esc(z.season)}: <b>${markHtml(z)}</b></td><td class="up">+${pct.toFixed(1)}%</td></tr>`);
      b.innerHTML = `<p class="muted rec-hint">Season-best to next season-best (2019→2021 bridges the cancelled 2020 season). Improvement in % of the earlier mark.</p>` + table(["#", "Athlete", "Event", "~Before", "After", "Gain"], rows, "No season-over-season improvements yet.");
    } else {
      c.innerHTML = select("mSeason", [...seasons].reverse(), st.season, "Season") + '<div class="seg" id="mGender" role="group" aria-label="Gender"></div>';
      const rows = events.map((e) => { const l = bestPerAthlete(evList(st.g, e).filter((p) => p.season === st.season)); if (!l.length) return ""; const rec = evList(st.g, e).sort(better)[0]; const isRec = rec && l[0] === rec;
        return `<tr><td class="ev">${esc(e)}</td><td class="mark">${markHtml(l[0])}${isRec ? tag("r", "SR", "Current school record") : ""}</td><td class="who">${who(l[0])}</td><td class="hide-sm">${gradeTxt(l[0])}</td><td class="hide-sm">${meetCell(l[0])}</td></tr>`; }).filter(Boolean);
      b.innerHTML = table(["Event", "Mark", "Athlete", "~Grade", "~Meet / Date"], rows, `No ${st.g.toLowerCase()} marks in ${st.season}.`);
    }
    seg($("#mGender"), ["Boys", "Girls"], st.g, (v) => { st.g = v; renderMore(); });
    const on = (id, k) => { const el = $("#" + id); if (el) el.onchange = () => { st[k] = el.value; renderMore(); }; };
    on("mEvent", "e"); on("mClass", "cls"); on("mImp", "imp"); on("mSeason", "season");
  };
  renderMore();

  // Notes
  const nHist = (data.historical || []).length;
  $("#notesBody").innerHTML = `<ul>
    <li>Records and lists cover <b>MileSplit results since ${esc(first)}</b> (the 2020 season was cancelled). ${nHist ? `<b>${nHist}</b> historical mark${nHist > 1 ? "s" : ""} from the coach's Historical Records tab are merged in (tagged ${tag("H", "HIST", "Historical record entered by the coach")}).` : "Older school records can be added: the coach enters them on the <b>Historical Records</b> tab of the team sheet and they merge into records and top-20 lists on the next data refresh."}</li>
    <li>Running events rank lower-is-better, field events higher-is-better. DNF, DNS, DQ, NH, FOUL, NM and NT never count.</li>
    <li><b>Hand-timed</b> marks (2017 Windjammer, 2021 Rangeview) show the original time with ${tag("h", "h", "Hand-timed")} and are ranked with the standard FAT conversion: +0.24s for races under 400m (relays by leg distance), +0.14s for 400m and longer.</li>
    <li><b>Wind-aided</b> marks (wind over +2.0 m/s) show ${tag("w", "w", "Wind-aided")} and are excluded from records, top-20 lists and the other views.</li>
    <li>Exhibition (non-scoring) entries are legal marks and count, tagged ${tag("x", "x", "Exhibition")}.</li>
    <li>${excluded.length} result${excluded.length === 1 ? "" : "s"} that look like data-entry errors are left out of these lists (field marks without feet-inches such as "6.50", and impossible times such as a 1.25 in the 1600m); they still appear in meet results. Marks tagged ${tag("odd", "?", "Unusual mark")} have an unusual inch fraction and should be verified.</li>
    <li>Grades come from the roster (MileSplit grade as of the latest season). Relay records list runners when the results file names them.</li></ul>`;
})();

// Sticky section nav: scroll-spy highlight (same behavior as the tracker), keeps the active link in view on mobile
(() => {
  const nav = document.getElementById("secnav"), wrap = document.getElementById("secnavLinks");
  const links = [...wrap.querySelectorAll('a[href^="#"]')];
  let last = null, ticking = false;
  function update() {
    const y = (nav.offsetHeight || 0) + 48;
    let cur = null;
    links.forEach((a) => { const s = document.querySelector(a.getAttribute("href")); if (s && !s.hidden && s.getBoundingClientRect().top <= y) cur = a; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = links[links.length - 1];
    links.forEach((a) => { const on = a === cur; a.classList.toggle("active", on); if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    if (cur && cur !== last) { const l = cur.offsetLeft - 12; if (l < wrap.scrollLeft || cur.offsetLeft + cur.offsetWidth > wrap.scrollLeft + wrap.clientWidth) wrap.scrollTo({ left: l, behavior: "smooth" }); }
    last = cur;
    nav.classList.toggle("stuck", nav.getBoundingClientRect().top <= 0 && scrollY > 0);
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); } }, { passive: true });
  addEventListener("resize", () => requestAnimationFrame(update));
  addEventListener("load", update); update();
})();
