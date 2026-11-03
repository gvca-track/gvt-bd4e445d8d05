// State & Relays page: season bests vs CHSAA qualifying marks, and a relay lineup builder. Same data.json as the other pages.
(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let data;
  try { data = await (await fetch("data.json", { cache: "no-store" })).json(); }
  catch (e) { document.querySelector("main").innerHTML = '<p class="empty">Could not load data.json. Serve this folder over HTTP (see README).</p>'; return; }

  const ORDER = ["100m", "200m", "400m", "800m", "1600m", "3200m", "100m Hurdles", "110m Hurdles", "300m Hurdles",
    "4x100 Relay", "4x200 Relay", "4x400 Relay", "4x800 Relay", "Sprint Medley Relay",
    "High Jump", "Pole Vault", "Long Jump", "Triple Jump", "Shot Put", "Discus"];
  const SKIP = new Set(["DNF", "DNS", "DQ", "NH", "FOUL", "NM", "NT", "SCR", ""]);
  const isCancelled = (m) => /^cancel+ed$/i.test((m.status || "").trim());
  const cx = new Set((data.meets || []).filter(isCancelled).map((m) => m.name + "|" + m.season));
  const seasons = [...new Set((data.results || []).map((r) => r.season).filter((s) => /^\d{4}$/.test(s || "")))].sort();
  const latest = seasons[seasons.length - 1] || "";
  const q = new URLSearchParams(location.search).get("season");
  let season = seasons.includes(q) ? q : latest;

  // Same normalisation as records.js: hand-time conversion, wind-aided and bogus marks excluded.
  const legDist = (ev) => { const m = ev.match(/(\d+)x(\d+)/i); if (m) return +m[2]; if (/medley/i.test(ev)) return 800; const n = ev.match(/^(\d+)/); return n ? +n[1] : 0; };
  const handAdj = (ev) => (legDist(ev) < 400 ? 0.24 : 0.14);
  const norm = (r) => {
    if (r.value == null || SKIP.has(String(r.mark).trim().toUpperCase()) || cx.has(r.meet + "|" + r.season)) return null;
    const notes = r.notes || "", hand = !r.field && /hand-timed/i.test(notes), w = parseFloat(r.wind);
    const windy = (!isNaN(w) && w > 2.0) || /wind-aided/i.test(notes);
    return { ...r, hand, windy, rank: hand ? +(r.value + handAdj(r.event)).toFixed(2) : r.value, disp: String(r.mark).replace(/(\d)[aqQRMxX*#]+$/, "$1") };
  };
  const all = (data.results || []).map(norm).filter((p) => p && (p.gender === "Boys" || p.gender === "Girls"));
  const med = {}; all.forEach((p) => { (med[p.gender + p.event] ||= []).push(p.value); });
  Object.keys(med).forEach((k) => { const v = med[k].sort((a, b) => a - b); med[k] = v[Math.floor(v.length / 2)]; });
  const bogus = (p) => p.field ? !/^\d+-\d/.test(p.disp) && !/m$/i.test(p.disp) : p.value < med[p.gender + p.event] * 0.6;
  const legal = all.filter((p) => !p.windy && !bogus(p));
  const better = (a, b) => (a.field ? b.rank - a.rank : a.rank - b.rank) || (a.date || "").localeCompare(b.date || "");

  const fmtT = (v) => { const m = Math.floor(v / 60), s = (v - m * 60).toFixed(2); return m ? `${m}:${s.padStart(5, "0")}` : s; };
  const fmtIn = (v) => { const f = Math.floor(v / 12), i = v - f * 12; return `${f}-${i.toFixed(2).padStart(5, "0")}`; };
  const fmt = (v, field) => (field ? fmtIn(v) : fmtT(v));
  const fmtGap = (v, field) => field ? (v >= 12 ? `${Math.floor(v / 12)}' ${(v % 12).toFixed(2)}"` : `${v.toFixed(2)}"`) : `${v < 60 ? v.toFixed(2) : fmtT(v)}s`;
  const tag = (cls, txt, tip) => `<span class="tag ${cls}" data-tip="${esc(tip)}" tabindex="0" role="button" aria-label="${esc(txt)}: ${esc(tip)}">${esc(txt)}</span>`;
  const markHtml = (p) => esc(p.disp) + (p.hand ? tag("h", "h", `Hand-timed. Ranked as ${fmtT(p.rank)} (+${handAdj(p.event).toFixed(2)}s FAT conversion)`) : "");
  const seg = (el, opts, val, on) => { el.innerHTML = opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === val}" class="${v === val ? "active" : ""}">${esc(l)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; [...el.children].forEach((c) => { c.classList.toggle("active", c === b); c.setAttribute("aria-pressed", c === b); }); on(b.dataset.v); }; };
  const GEN = [["Boys", "Boys"], ["Girls", "Girls"]];
  const seasonBests = (se) => { const m = new Map(); legal.filter((p) => p.season === se).forEach((p) => { const k = p.athlete + "|" + p.event; if (!m.has(k) || better(p, m.get(k)) < 0) m.set(k, p); }); return [...m.values()]; };

  // ---------- Qualifying standards ----------
  const QUAL = (data.qualifying || []);
  const qualSeasons = [...new Set(QUAL.map((x) => x.season))].sort();
  const stdFor = (se) => { const s = qualSeasons.includes(se) ? se : qualSeasons.filter((x) => x <= se).pop() || qualSeasons[qualSeasons.length - 1]; return { season: s, list: QUAL.filter((x) => x.season === s) }; };
  const st = { qg: "Boys", grp: "All", cg: "All", pct: "3" };

  function qualRows(se, g) {
    const sb = seasonBests(se), std = stdFor(se);
    return ORDER.map((ev) => {
      const s = std.list.find((x) => x.event === ev && x.gender === g);
      if (!s) return null;
      const field = /jump|vault|put|discus/i.test(ev);
      const rows = sb.filter((p) => p.event === ev && p.gender === g).map((p) => {
        if (s.value == null) return { p, met: false, gap: null, pct: null };
        const gap = field ? s.value - p.rank : p.rank - s.value;
        return { p, met: gap <= 0.0001, gap, pct: gap / s.value * 100 };
      }).sort((a, b) => (a.pct ?? 1e9) - (b.pct ?? 1e9) || better(a.p, b.p));
      return { ev, s, field, rows, group: rows[0]?.p.group || (/relay/i.test(ev) ? "Relays" : "") };
    }).filter(Boolean);
  }
  const gapCell = (r, field) => r.gap == null ? '<td class="gap muted">—</td>' : r.met
    ? `<td class="gap met">${tag("q", "Q", "At or better than the state qualifying mark")}<span class="pct">${field ? "+" : "−"}${fmtGap(-r.gap, field)}</span></td>`
    : `<td class="gap">${field ? "−" : "+"}${fmtGap(r.gap, field)}<span class="pct">${r.pct.toFixed(1)}% off</span></td>`;
  const bar = (r) => r.pct == null ? "" : `<div class="bar${r.met ? " met" : ""}"><i style="width:${Math.max(4, Math.min(100, 100 - r.pct * 5)).toFixed(0)}%"></i></div>`;

  function renderQual() {
    const std = stdFor(season);
    const ref = std.season !== season;
    const list = qualRows(season, st.qg).filter((x) => st.grp === "All" || x.group === st.grp || (st.grp === "Relays" && /relay/i.test(x.ev)));
    const src = std.list.find((x) => /^http/.test(x.source))?.source || "";
    $("#qHint").innerHTML = `Season-best (wind-legal, hand times converted) vs. the CHSAA Class 2A ${esc(std.season)} qualifying mark: the <b>18th-place</b> seed on CHSAA's final 2A state performance list (CHSAA takes the top 18 per event; there is no fixed time standard). ` +
      (ref ? `<b>No ${esc(season)} list on file, so the ${esc(std.season)} marks are shown for reference.</b> ` : "") + (src ? `Source: <a href="${esc(src)}" target="_blank" rel="noopener">CHSAA 2A ${esc(std.season)} state performance list</a>.` : "");
    $("#qBody").innerHTML = list.map(({ ev, s, field, rows }) => `<div class="card pr-event"><h3>${esc(ev)} <small class="q-std">${s.value == null ? tag("unv", "Unverified", s.source || "No verified CHSAA mark for this event") : `Cut <b>${esc(s.standard)}</b>${ref ? " " + tag("ref", s.season, `Reference: ${s.season} cut`) : ""}`}</small></h3>
      <table class="rec-table"><tbody>${rows.length ? rows.map((r, i) => `<tr class="${r.met ? "cur" : ""}"><td class="rk"><span class="rkb">${i + 1}</span></td><td class="who">${esc(r.p.athlete)}${r.p.relay && r.p.runners ? "" : ""}${bar(r)}</td><td class="mark">${markHtml(r.p)}</td>${gapCell(r, field)}</tr>`).join("")
        : `<tr><td class="empty">No ${esc(st.qg.toLowerCase())} marks in ${esc(season)}</td></tr>`}</tbody></table></div>`).join("") || '<div class="card empty">No events in this group.</div>';
  }
  function renderClose() {
    const lim = +st.pct, out = [];
    ["Boys", "Girls"].filter((g) => st.cg === "All" || st.cg === g).forEach((g) => qualRows(season, g).forEach(({ ev, field, rows }) => rows.forEach((r) => { if (r.pct != null && !r.met && r.pct <= lim) out.push({ ...r, ev, field, g }); })));
    out.sort((a, b) => a.pct - b.pct);
    const met = [];
    ["Boys", "Girls"].filter((g) => st.cg === "All" || st.cg === g).forEach((g) => qualRows(season, g).forEach(({ ev, rows }) => rows.forEach((r) => { if (r.met) met.push(`${r.p.athlete} (${ev})`); })));
    $("#closeHint").innerHTML = `${met.length ? `<b>${met.length}</b> mark${met.length === 1 ? "" : "s"} at or under the cut in ${esc(season)}: ${esc(met.join(", "))}. ` : `No ${esc(season)} marks at the cut yet. `}Below: not there yet, but within ${lim}% (closest first).`;
    $("#closeBody").innerHTML = out.length ? `<div class="close-grid">${out.map((r) => `<div class="card close-card"><div class="nm">${esc(r.p.athlete)}</div><div class="ev">${esc(r.g)} · ${esc(r.ev)}</div>
      <div class="nums"><div><span>Season best</span>${markHtml(r.p)}</div><div><span>Cut</span>${esc(fmt(r.field ? r.p.rank + r.gap : r.p.rank - r.gap, r.field))}</div><div><span>Gap</span>${r.field ? "−" : "+"}${fmtGap(r.gap, r.field)} · ${r.pct.toFixed(1)}%</div></div>${bar(r)}</div>`).join("")}</div>`
      : `<div class="card empty">Nobody within ${lim}% of a cut in ${esc(season)}.</div>`;
  }
  seg($("#qGender"), GEN, st.qg, (v) => { st.qg = v; renderQual(); });
  seg($("#qGroup"), [["All", "All"], ["Sprints", "Sprints"], ["Distance", "Distance"], ["Hurdles", "Hurdles"], ["Relays", "Relays"], ["Jumps", "Jumps"], ["Throws", "Throws"]], st.grp, (v) => { st.grp = v; renderQual(); });
  seg($("#closeGender"), [["All", "All"], ...GEN], st.cg, (v) => { st.cg = v; renderClose(); });
  seg($("#closePct"), [["2", "≤2%"], ["3", "≤3%"], ["5", "≤5%"], ["10", "≤10%"]], st.pct, (v) => { st.pct = v; renderClose(); });

  // ---------- Relay builder ----------
  const RELAYS = [
    { ev: "4x100 Relay", legs: ["100m", "100m", "100m", "100m"] },
    { ev: "4x200 Relay", legs: ["200m", "200m", "200m", "200m"] },
    { ev: "4x400 Relay", legs: ["400m", "400m", "400m", "400m"] },
    { ev: "4x800 Relay", legs: ["800m", "800m", "800m", "800m"] },
    { ev: "Sprint Medley Relay", legs: ["200m", "200m", "400m", "800m"] },
  ];
  const rs = { relay: RELAYS[0].ev, g: "Boys", lock: new Set(), out: new Set() };
  $("#rRelay").innerHTML = RELAYS.map((r) => `<option value="${esc(r.ev)}">${esc(r.ev === "Sprint Medley Relay" ? "Sprint Medley (200/200/400/800)" : r.ev)}</option>`).join("");
  $("#rRelay").onchange = () => { rs.relay = $("#rRelay").value; rs.lock.clear(); rs.out.clear(); renderRelay(); };
  seg($("#rGender"), GEN, rs.g, (v) => { rs.g = v; rs.lock.clear(); rs.out.clear(); renderRelay(); });
  $("#rReset").onclick = () => { rs.lock.clear(); rs.out.clear(); renderRelay(); };

  // Best `k` assignments of distinct athletes to legs (each leg has its own candidate list), honouring locks.
  function lineups(def, sb, k = 3) {
    const legEvents = def.legs;
    const cand = legEvents.map((e) => sb.filter((p) => p.event === e && p.gender === rs.g && !rs.out.has(p.athlete)).sort(better).slice(0, 10));
    const res = [], seen = new Set();
    const rec = (i, used, picks, sum) => {
      if (i === legEvents.length) {
        if ([...rs.lock].some((a) => !used.has(a))) return;
        const key = def.legs.every((l) => l === def.legs[0]) ? [...used].sort().join("|") : picks.map((p) => p.athlete).join("|");
        if (seen.has(key)) return; seen.add(key); res.push({ picks: [...picks], sum }); return;
      }
      for (const p of cand[i]) { if (used.has(p.athlete)) continue; used.add(p.athlete); picks.push(p); rec(i + 1, used, picks, sum + p.rank); picks.pop(); used.delete(p.athlete); }
    };
    rec(0, new Set(), [], 0);
    res.sort((a, b) => a.sum - b.sum);
    // same-distance relays: list legs fastest-first only for display
    return res.slice(0, k);
  }
  function renderRelay() {
    const def = RELAYS.find((r) => r.ev === rs.relay), sb = seasonBests(season);
    const legEvs = [...new Set(def.legs)];
    const pool = sb.filter((p) => legEvs.includes(p.event) && p.gender === rs.g);
    const names = [...new Set(pool.sort(better).map((p) => p.athlete))];
    const sbOf = (n) => legEvs.map((e) => { const p = pool.find((x) => x.athlete === n && x.event === e); return p ? `${e.replace("m", "")} ${fmtT(p.rank)}` : ""; }).filter(Boolean).join(" · ");
    $("#rPool").innerHTML = names.length ? names.map((n) => { const s = rs.lock.has(n) ? "locked" : rs.out.has(n) ? "out" : ""; return `<button type="button" class="chip ${s}" data-n="${esc(n)}" aria-pressed="${!!s}" aria-label="${esc(n)}: ${s === "locked" ? "locked in" : s === "out" ? "excluded" : "available"}">${s === "locked" ? "🔒 " : ""}${esc(n)} <small>${esc(sbOf(n))}</small></button>`; }).join("")
      : `<span class="muted">No ${esc(rs.g.toLowerCase())} ${esc(legEvs.join("/"))} marks in ${esc(season)}.</span>`;
    $("#rPool").onclick = (e) => { const b = e.target.closest("button.chip"); if (!b) return; const n = b.dataset.n;
      if (rs.lock.has(n)) { rs.lock.delete(n); rs.out.add(n); } else if (rs.out.has(n)) rs.out.delete(n); else if (rs.lock.size < def.legs.length) rs.lock.add(n); else rs.out.add(n); renderRelay(); };
    const ls = lineups(def, sb);
    const same = def.legs.every((l) => l === def.legs[0]);
    $("#rLineups").innerHTML = ls.length ? ls.map((l, i) => {
      const picks = same ? [...l.picks].sort(better) : l.picks;
      const delta = i ? ` (+${(l.sum - ls[0].sum).toFixed(2)}s)` : "";
      return `<div class="card pr-event r-card"><h3>Lineup ${String.fromCharCode(65 + i)} <small>Est. ${fmtT(l.sum)}${delta}</small></h3><table class="rec-table"><tbody>${picks.map((p, j) => `<tr><td class="leg">${same ? "Leg " + (j + 1) : esc(def.legs[j])}</td><td class="who">${esc(p.athlete)}${rs.lock.has(p.athlete) ? " 🔒" : ""}<span class="sub">${esc(p.meet)}</span></td><td class="mark">${markHtml(p)}</td></tr>`).join("")}</tbody></table>
        <div class="r-foot">${tag("w", "est.", "Sum of open season bests (wind-legal, hand times converted). Not a relay mark.")} Sum of open marks${same ? "; leg order is up to the coach" : ""}.</div></div>`;
    }).join("") : `<div class="card empty">Not enough ${esc(rs.g.toLowerCase())} athletes with ${esc(legEvs.join("/"))} marks in ${esc(season)}${rs.lock.size || rs.out.size ? " with these locks/exclusions" : ""} to fill ${def.legs.length} legs.</div>`;
    // actual marks
    const act = legal.filter((p) => p.relay && p.event === def.ev && p.gender === rs.g);
    const cur = act.filter((p) => p.season === season).sort(better).slice(0, 3);
    const allBest = [...act].sort(better)[0];
    $("#rActualSeason").textContent = `${season} · ${rs.g} ${def.ev}`;
    const runners = (p) => ((p.notes || "").split(";").slice(1).map((s) => s.trim()).find((s) => s.includes(",") && !/exhibition|hand|wind|runners not listed|no mark/i.test(s)) || "Runners not listed");
    const est = ls[0] ? ls[0].sum : null;
    const rows = cur.map((p) => `<tr class="cur"><td class="mark">${markHtml(p)}</td><td class="who">${esc(p.athlete)}<span class="sub">${esc(runners(p))}</span></td><td class="hide-sm">${esc(p.meet)}</td><td>${est ? (p.rank - est >= 0 ? "+" : "−") + Math.abs(p.rank - est).toFixed(2) + "s" : "—"}</td></tr>`);
    if (allBest && !cur.includes(allBest)) rows.push(`<tr><td class="mark">${markHtml(allBest)}</td><td class="who">${esc(allBest.athlete)} ${tag("H", "PB", "Best on file, any season (school record)")}<span class="sub">${esc(runners(allBest))}</span></td><td class="hide-sm">${esc(allBest.meet)} (${esc(allBest.season)})</td><td>${est ? (allBest.rank - est >= 0 ? "+" : "−") + Math.abs(allBest.rank - est).toFixed(2) + "s" : "—"}</td></tr>`);
    $("#rActual").innerHTML = rows.length ? `<div class="card table-wrap"><table class="rec-table"><thead><tr><th>Mark</th><th>Team / runners</th><th class="hide-sm">Meet</th><th>vs Lineup A</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`
      : `<div class="card empty">No ${esc(rs.g.toLowerCase())} ${esc(def.ev)} marks on file.</div>`;
  }

  // ---------- Season, notes ----------
  const unv = QUAL.filter((x) => x.value == null);
  const std = stdFor(season);
  $("#notesBody").innerHTML = `<ul>
    <li><b>Classification:</b> Golden View competes in CHSAA Class 2A track &amp; field (Foothills League).</li>
    <li><b>How CHSAA qualifies:</b> no fixed time/distance standards. Athletes are ranked on MaxPreps from approved qualifying meets and the top 18 per event in 2A go to state (ties at 18th can add advancers). The "cut" used here is the 18th-place seed on CHSAA's official final 2A performance list (top marks for that season), stored in <code>data/qualifying_standards.csv</code>.</li>
    <li><b>Source:</b> ${[...new Set(QUAL.map((x) => x.source).filter((s) => /^http/.test(s)))].map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a>`).join(", ")}. Cuts change every year; a season without its own list uses the most recent one for reference.</li>
    ${unv.length ? `<li><b>Unverified:</b> ${esc([...new Set(unv.map((x) => x.gender + " " + x.event))].join(", "))}: not on the CHSAA 2A list, so left blank (no gap shown).</li>` : ""}
    <li><b>Marks:</b> season bests exclude wind-aided marks (&gt; +2.0 m/s) and obvious entry errors; hand times add +0.24s (under 400m) or +0.14s (400m and up) before comparing, matching the School Records page.</li>
    <li><b>Relay estimates</b> add individual open season bests (4x100 from 100m, 4x200 from 200m, 4x400 from 400m, 4x800 from 800m, SMR from 200/200/400/800). They ignore exchanges and rolling starts and are for comparing lineups, not predicting a time.</li>
  </ul>`;
  const opts = [...seasons].reverse().map((s) => `<option value="${s}">${s}${s === latest ? " (latest)" : ""}</option>`).join("");
  ["#seasonSel", "#seasonSelMini"].forEach((id) => { const el = $(id); el.innerHTML = opts; el.value = season; el.onchange = () => setSeason(el.value); });
  function setSeason(se) {
    season = se; ["#seasonSel", "#seasonSelMini"].forEach((id) => { $(id).value = se; });
    const u = new URL(location.href); if (se === latest) u.searchParams.delete("season"); else u.searchParams.set("season", se); history.replaceState(null, "", u);
    $("#seasonPill").textContent = `Season ${se}`; rs.lock.clear(); rs.out.clear(); renderAll();
  }
  function renderAll() { renderClose(); renderQual(); renderRelay(); }
  $("#updated").textContent = data.generated ? "Last updated " + new Date(data.generated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  setSeason(season);

  // Sticky nav scroll-spy (same behaviour as records page)
  const navLinks = [...document.querySelectorAll('#secnavLinks a[href^="#"]')];
  const spy = () => { const y = ($("#secnav").offsetHeight || 0) + 48; let cur = null;
    navLinks.forEach((a) => { const s = document.querySelector(a.getAttribute("href")); if (s && s.getBoundingClientRect().top <= y) cur = a; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = navLinks[navLinks.length - 1];
    navLinks.forEach((a) => { a.classList.toggle("active", a === cur); if (a === cur) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    if (cur && cur !== spy.last) { spy.last = cur; const w = $("#secnavLinks"); if (cur.offsetLeft < w.scrollLeft || cur.offsetLeft + cur.offsetWidth > w.scrollLeft + w.clientWidth) w.scrollTo({ left: cur.offsetLeft - 12, behavior: "smooth" }); }
    $("#secnav").classList.toggle("stuck", $("#secnav").getBoundingClientRect().top <= 0 && scrollY > 0); };
  addEventListener("scroll", () => requestAnimationFrame(spy), { passive: true }); spy();
})();
