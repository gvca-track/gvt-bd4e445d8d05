/* Golden View Track & Field season tracker. Loads data.json (built by build_data.py). */
(async function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TZ = "America/Denver";
  let data;
  try { data = await (await fetch("data.json", { cache: "no-store" })).json(); }
  catch (e) { document.querySelector("main").innerHTML = '<p class="empty">Could not load data.json. Serve this folder over HTTP (see README).</p>'; return; }

  const results = data.results || [];
  const valid = results.filter((r) => r.value != null);
  const better = (a, b, field) => (field ? a > b : a < b);
  const seasons = [...new Set(results.map((r) => r.season).filter(Boolean))].sort();
  const latestSeason = seasons[seasons.length - 1] || "";
  const fromUrl = () => { const q = new URLSearchParams(location.search).get("season") || (location.hash.match(/season=(\d{4})/) || [])[1]; return seasons.includes(q) ? q : latestSeason; };
  let curSeason = fromUrl();
  const athletesByName = Object.fromEntries((data.athletes || []).map((a) => [a.name, a]));
  const genderOf = (r) => r.gender || (athletesByName[r.athlete] || {}).gender || (/^(Boys|Girls)\b/.exec(r.athlete) || [])[1] || "";
  const GROUPS = data.groups || ["Sprints", "Distance", "Hurdles", "Relays", "Jumps", "Throws"];
  const eventOrder = (e) => { const g = [...GROUPS, "Other"].indexOf(groupOf(e)); const n = parseInt(e) || 0; return g * 100000 + n; };
  function groupOf(e) { const r = results.find((x) => x.event === e); return r ? r.group : "Other"; }
  const fmtDate = (iso, opts) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { timeZone: TZ, ...opts }) : "";
  // Grade for a given season, from build_data.py's per-season map (blank when unknown or outside 9-12)
  const gradeIn = (a, se) => (a && a.gradeBySeason ? a.gradeBySeason[se] || "" : "");
  // Stable anchor for a meet panel, e.g. #meet-2025-kiowa-klassic
  const meetId = (name, se) => "meet-" + se + "-" + String(name).replace(/\s+20\d\d\s*$/, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const initials = (n) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("");
  const tags = (r) => (r.qualified ? '<span class="tag q">Q</span>' : "") + (r.record ? '<span class="tag r">R</span>' : "") + (r.fat ? '<span class="tag a" title="Fully automatic timing">FAT</span>' : "");
  const markText = (m) => String(m).replace(/(\d)[aqQRM]+$/, "$1");

  // best mark per athlete+event (+season)
  function bests(list) {
    const map = {};
    for (const r of list) {
      const k = r.athlete + "|" + r.event;
      if (!map[k] || better(r.value, map[k].value, r.field) || (r.value === map[k].value && (r.date || "") < (map[k].date || ""))) map[k] = r;
    }
    return map;
  }
  let curResults, curBests, prSet, groups;
  const state = { gender: "All", group: "All" };
  const charts = [];
  function render() {
  curResults = valid.filter((r) => r.season === curSeason);
  curBests = bests(curResults);
  prSet = new Set(Object.values(curBests));

  // Header
  $("#seasonPill").textContent = curSeason ? `Season ${curSeason}` : "Season";
  if (data.generated) {
    const d = new Date(data.generated);
    $("#updated").textContent = "Last updated " + d.toLocaleString("en-US", { timeZone: TZ, month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + " MT";
  }

  // Overview stats
  const meetsCompeted = new Set(curResults.map((r) => r.meet)).size;
  const events = [...new Set(curResults.map((r) => r.event))];
  const wins = results.filter((r) => r.season === curSeason && r.place === "1").length;
  const stats = [
    [new Set(curResults.filter((r) => !r.relay).map((r) => r.athlete)).size, "Athletes Competing"],
    [results.filter((r) => r.season === curSeason).length, "Marks Recorded"],
    [meetsCompeted, "Meets Competed"],
    [events.length, "Events Contested"],
    [wins, "Event Wins"],
  ];
  $("#stats").innerHTML = stats.map(([n, l]) => `<div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`).join("");

  // PR board
  const genders = ["All", ...new Set((data.athletes || []).map((a) => a.gender).filter(Boolean))];
  const present = new Set(valid.map((r) => r.group));
  groups = ["All", ...GROUPS.filter((g) => present.has(g))];
  function seg(el, opts, key) {
    el.innerHTML = opts.map((o) => `<button data-v="${esc(o)}" class="${state[key] === o ? "active" : ""}">${esc(o)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state[key] = b.dataset.v; seg(el, opts, key); renderPR(); };
  }
  seg($("#genderFilter"), genders, "gender");
  seg($("#groupFilter"), groups, "group");
  function renderPR() {
    const rows = Object.values(curBests).filter((r) => {
      return (state.gender === "All" || genderOf(r) === state.gender) && (state.group === "All" || r.group === state.group);
    });
    const byEv = {};
    rows.forEach((r) => { const g = genderOf(r); const k = (g ? g + " " : "") + r.event; (byEv[k] = byEv[k] || { ev: r.event, g, list: [] }).list.push(r); });
    const keys = Object.keys(byEv).sort((a, b) => byEv[a].g.localeCompare(byEv[b].g) || eventOrder(byEv[a].ev) - eventOrder(byEv[b].ev));
    $("#prBoard").innerHTML = keys.length ? keys.map((k) => {
      const { ev, g, list } = byEv[k];
      list.sort((a, b) => (a.field ? b.value - a.value : a.value - b.value));
      return `<article class="card pr-event"><h3>${esc(ev)} <small>${esc(g)}</small></h3>${list.map((r, i) => `
        <div class="pr-row"><span class="rank ${i === 0 ? "r1" : ""}">${i + 1}</span>
        <div><div class="pr-name">${esc(r.athlete)}</div><div class="pr-sub">${esc(r.meet)} · ${fmtDate(r.date, { month: "short", day: "numeric" })}${r.round && r.round !== "Final" ? " · " + esc(r.round) : ""}</div></div>
        <div class="pr-mark">${esc(markText(r.mark))}${tags(r)}</div></div>`).join("")}</article>`;
    }).join("") : '<div class="card empty">No marks match these filters.</div>';
  }
  renderPR();

  // Athlete profiles
  charts.forEach((c) => c && c.destroy()); charts.length = 0;
  const sortedAth = [...(data.athletes || [])].sort((a, b) => a.gender.localeCompare(b.gender) || a.name.split(" ").pop().localeCompare(b.name.split(" ").pop()));
  const seasonAth = sortedAth.filter((a) => curResults.some((r) => r.athlete === a.name));
  $("#athleteCount").textContent = `${seasonAth.length} athletes competed in ${curSeason}`;
  $("#athleteGrid").innerHTML = seasonAth.length ? seasonAth.map((a) => {
    const i = sortedAth.indexOf(a);
    const lastSeason = curSeason;
    const mine = curResults.filter((r) => r.athlete === a.name);
    const myBests = bests(mine);
    const evs = [...new Set(mine.map((r) => r.event))].sort((x, y) => eventOrder(x) - eventOrder(y));
    const gr = gradeIn(a, curSeason);
    const grpSet = [...new Set(mine.map((r) => r.group))].join("|");
    let imp = 0; evs.forEach((e) => { const ps = mine.filter((r) => r.event === e).sort((x, y) => (x.date || "").localeCompare(y.date || "")); const b = myBests[a.name + "|" + e]; if (ps.length > 1 && ps[0].value) { const v = b.field ? (b.value - ps[0].value) / ps[0].value : (ps[0].value - b.value) / ps[0].value; imp = Math.max(imp, v); } });
    const chips = evs.map((e) => { const b = myBests[a.name + "|" + e]; return `<div class="chip">${esc(e)}<b>${esc(markText(b.mark))}</b></div>`; }).join("");
    return `<article class="card athlete" data-name="${esc(a.name.toLowerCase())}" data-gender="${esc(a.gender)}" data-grade="${esc(gr)}" data-groups="${esc(grpSet)}" data-imp="${imp.toFixed(5)}" data-last="${esc(a.name.split(" ").pop().toLowerCase())}"><div class="ath-head"><div class="avatar">${esc(initials(a.name))}</div>
      <div><h3>${esc(a.name)}</h3><div class="ath-meta">${esc(a.gender)}${gr ? " · Grade " + esc(gr) : ""} · ${mine.length} mark${mine.length === 1 ? "" : "s"} in ${esc(lastSeason)}</div></div></div>
      <div class="ath-prs">${chips || '<span class="muted">No marks yet</span>'}</div>
      ${evs.length ? `<div class="ev-tabs" data-i="${i}">${evs.map((e, j) => `<button class="${j === 0 ? "active" : ""}" data-e="${esc(e)}">${esc(e)}</button>`).join("")}</div><div class="chart-box"><canvas id="ch${i}"></canvas></div>` : ""}
    </article>`;
  }).join("") : '<div class="card empty">No athletes competed this season.</div>';
  function drawChart(i, ev) {
    const a = sortedAth[i];
    const pts = valid.filter((r) => r.athlete === a.name && r.event === ev).sort((x, y) => (x.date || "").localeCompare(y.date || "") || (x.round === "Prelim" ? -1 : 1));
    const field = pts[0]?.field;
    const ctx = document.getElementById("ch" + i);
    if (!ctx || !window.Chart) return;
    if (charts[i]) charts[i].destroy();
    const best = bests(pts.filter((p) => p.season === curSeason))[a.name + "|" + ev];
    const sel = (p) => p.season === curSeason;
    const multi = new Set(pts.map((p) => p.season)).size > 1;
    charts[i] = new Chart(ctx, {
      type: "line",
      data: { labels: pts.map((p) => fmtDate(p.date, multi ? { month: "short", day: "numeric", year: "2-digit" } : { month: "short", day: "numeric" }) + (p.round === "Prelim" ? " (P)" : "")),
        datasets: [{ data: pts.map((p) => p.value), borderColor: "#0b1f3a", backgroundColor: "rgba(201,162,39,.15)", fill: false, cubicInterpolationMode: "monotone", borderWidth: 2.5,
          pointRadius: pts.map((p) => (p === best ? 8 : sel(p) ? 5 : 3)), pointBackgroundColor: pts.map((p) => (p === best ? "#c9a227" : sel(p) ? "#0b1f3a" : "#b8c2d3")),
          segment: { borderColor: (c) => (sel(pts[c.p1DataIndex]) && sel(pts[c.p0DataIndex]) ? "#0b1f3a" : "#c9d1de") }, pointBorderColor: "#fff", pointBorderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false },
          tooltip: { callbacks: { title: (c) => pts[c[0].dataIndex].meet, label: (c) => `${markText(pts[c.dataIndex].mark)}  (${pts[c.dataIndex].dateLabel} ${pts[c.dataIndex].season})` } } },
        scales: { y: { reverse: !field, grid: { color: "#eef1f6" }, ticks: { font: { size: 11 }, callback: (v) => fmtVal(v, field) },
            title: { display: true, text: field ? "higher is better" : "faster ↑", font: { size: 10 }, color: "#5d6b82" } },
          x: { offset: pts.length < 3, grid: { display: false }, ticks: { font: { size: 11 } } } } },
    });
  }
  function fmtVal(v, field) {
    if (field) return Math.floor(v / 12) + "-" + (v % 12).toFixed(1).padStart(4, "0");
    if (v >= 60) { const m = Math.floor(v / 60); return m + ":" + (v - m * 60).toFixed(2).padStart(5, "0"); }
    return Number(v).toFixed(2);
  }
  document.querySelectorAll(".ev-tabs").forEach((t) => {
    t.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; t.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); drawChart(+t.dataset.i, b.dataset.e); };
  });
  applyAthFilters();
  const initCharts = () => document.querySelectorAll(".ev-tabs").forEach((t) => drawChart(+t.dataset.i, t.querySelector("button").dataset.e));
  if (window.Chart) initCharts(); else window.addEventListener("load", initCharts, { once: true });

  // Meet results grouped by meet
  const meetMap = {};
  results.filter((r) => r.season === curSeason).forEach((r) => { const k = r.meet + "|" + r.season; (meetMap[k] = meetMap[k] || { name: r.meet, date: r.date, label: r.dateLabel, list: [] }).list.push(r); if ((r.date || "") < (meetMap[k].date || "~")) meetMap[k].date = r.date; });
  const meetInfo = Object.fromEntries((data.meets || []).filter((m) => m.season === curSeason).map((m) => [m.name, m]));
  const meetsSorted = Object.values(meetMap).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  $("#meetResults").innerHTML = meetsSorted.length ? meetsSorted.map((m, i) => {
    m.list.sort((a, b) => eventOrder(a.event) - eventOrder(b.event) || a.event.localeCompare(b.event) || (a.round === "Prelim" ? -1 : 1) || (a.value ?? 1e9) - (b.value ?? 1e9));
    const loc = meetInfo[m.name]?.location;
    const dt = m.date ? new Date(m.date + "T12:00:00") : null;
    return `<details class="card meet" id="${meetId(m.name, curSeason)}" ${i === 0 ? "open" : ""}><summary>
      <div class="datebox"><div class="m">${dt ? dt.toLocaleString("en-US", { month: "short", timeZone: TZ }) : ""}</div><div class="d">${dt ? dt.getDate() : "—"}</div></div>
      <div class="meet-title"><h3>${esc(m.name)}</h3><div>${esc(m.label)}${loc ? " · " + esc(loc) : ""}</div></div>
      <span class="count">${m.list.length} mark${m.list.length === 1 ? "" : "s"}</span>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary>
      <div class="table-wrap"><table><thead><tr><th>Event</th><th>Athlete</th><th>Mark</th><th>Place</th><th>Round</th><th>Wind</th></tr></thead><tbody>
      ${m.list.map((r) => `<tr><td>${esc(r.event)}</td><td>${esc(r.athlete)}</td><td class="mark">${esc(markText(r.mark))}${tags(r)}${prSet.has(r) ? '<span class="pr-flag">PR</span>' : ""}</td><td>${esc(r.place) || "—"}</td><td>${esc(r.round)}</td><td>${esc(r.wind) || "—"}</td></tr>`).join("")}
      </tbody></table></div></details>`;
  }).join("") : "";
  $("#results").hidden = !meetsSorted.length;

  // Schedule
  const meets = (data.meets || []).filter((m) => (m.season || "").includes(curSeason));
  $("#schedule").hidden = !meets.length;
  if (meets.length) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const nextIdx = meets.findIndex((m) => m.date && m.date >= today);
    $("#scheduleTable").innerHTML = `<thead><tr><th>Date</th><th>Day</th><th>Time</th><th>Meet / Event</th><th>Location</th><th class="res-col">Results</th></tr></thead><tbody>` +
      meets.map((m, i) => `<tr class="${m.date && m.date < today ? "past" : ""} ${i === nextIdx ? "next" : ""}">
        <td><b>${fmtDate(m.date, { month: "short", day: "numeric", year: "numeric" })}</b></td><td>${esc(m.day)}</td><td>${esc(m.time) || "TBA"}</td>
        <td><b style="color:var(--navy)">${esc(m.name)}</b>${meetMap[m.name + "|" + curSeason] ? ` <a class="res-link res-inline" href="#${meetId(m.name, curSeason)}" data-meet="${meetId(m.name, curSeason)}" aria-label="Results for ${esc(m.name)}">Results<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>` : ""}</td><td>${m.mapUrl ? `<a class="map-link" href="${esc(m.mapUrl)}" target="_blank" rel="noopener"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>${esc(m.location || "Map")}</a>` : esc(m.location) || "TBA"}</td>
        <td class="res-col">${meetMap[m.name + "|" + curSeason] ? `<a class="res-link" href="#${meetId(m.name, curSeason)}" data-meet="${meetId(m.name, curSeason)}" aria-label="Results for ${esc(m.name)}">Results<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>` : '<span class="muted">—</span>'}</td></tr>`).join("") + "</tbody>";
  }
  }
  // Athlete filters (work on the current season's cards)
  const af = { q: "", gender: "All", group: "All", grade: "All", sort: "name" };
  function afSeg(el, opts, key) {
    el.innerHTML = opts.map((o) => `<button type="button" data-v="${esc(o)}" class="${af[key] === o ? "active" : ""}" aria-pressed="${af[key] === o}">${esc(o)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; af[key] = b.dataset.v; afSeg(el, opts, key); applyAthFilters(); };
  }
  function initAthFilters() {
    afSeg($("#afGender"), ["All", "Girls", "Boys"], "gender");
    afSeg($("#afGrade"), ["All", "9", "10", "11", "12"], "grade");
    $("#afGroup").innerHTML = ["All", ...GROUPS].map((g) => `<option value="${esc(g)}">${g === "All" ? "All groups" : esc(g)}</option>`).join("");
    $("#afName").addEventListener("input", (e) => { af.q = e.target.value.trim().toLowerCase(); applyAthFilters(); });
    $("#afGroup").onchange = (e) => { af.group = e.target.value; applyAthFilters(); };
    $("#afSort").onchange = (e) => { af.sort = e.target.value; applyAthFilters(); };
    $("#afClear").onclick = () => { Object.assign(af, { q: "", gender: "All", group: "All", grade: "All", sort: "name" }); $("#afName").value = ""; $("#afGroup").value = "All"; $("#afSort").value = "name"; initSegs(); applyAthFilters(); };
    const initSegs = () => { afSeg($("#afGender"), ["All", "Girls", "Boys"], "gender"); afSeg($("#afGrade"), ["All", "9", "10", "11", "12"], "grade"); };
    $("#afToggle").onclick = () => { const f = $("#athFilters"); const open = !f.classList.contains("open"); f.classList.toggle("open", open); $("#afToggle").setAttribute("aria-expanded", open); };
  }
  function applyAthFilters() {
    const cards = [...document.querySelectorAll("#athleteGrid .athlete")];
    let shown = 0;
    const sorted = [...cards].sort((x, y) => af.sort === "grade" ? (+y.dataset.grade || 0) - (+x.dataset.grade || 0) || x.dataset.last.localeCompare(y.dataset.last)
      : af.sort === "improved" ? (+y.dataset.imp) - (+x.dataset.imp) : x.dataset.last.localeCompare(y.dataset.last) || x.dataset.name.localeCompare(y.dataset.name));
    sorted.forEach((c, k) => {
      const ok = (!af.q || c.dataset.name.includes(af.q)) && (af.gender === "All" || c.dataset.gender === af.gender)
        && (af.grade === "All" || c.dataset.grade === af.grade) && (af.group === "All" || c.dataset.groups.split("|").includes(af.group));
      c.hidden = !ok; c.style.order = k; if (ok) shown++;
    });
    const active = [af.q, af.gender !== "All", af.group !== "All", af.grade !== "All"].filter(Boolean).length;
    $("#afCount").innerHTML = `Showing <b>${shown}</b> of ${cards.length} athletes`;
    $("#afClear").disabled = !active && af.sort === "name";
    const badge = $("#afBadge"); badge.hidden = !active; badge.textContent = active;
    let empty = $("#afEmpty");
    if (!shown && cards.length) { if (!empty) { empty = document.createElement("div"); empty.id = "afEmpty"; empty.className = "card empty"; empty.style.gridColumn = "1/-1"; $("#athleteGrid").append(empty); } empty.textContent = "No athletes match these filters."; empty.hidden = false; }
    else if (empty) empty.hidden = true;
    window.dispatchEvent(new Event("resize"));
  }
  initAthFilters();

  // Sticky section nav: active-section highlight + compact season selector
  const navLinks = [...document.querySelectorAll("#secnavLinks a")];
  function updateActive() {
    const y = ($("#secnav").offsetHeight || 0) + 48;
    let cur = null;
    navLinks.forEach((a) => { const s = document.querySelector(a.getAttribute("href")); a.hidden = !s || s.hidden; });
    navLinks.forEach((a) => { const s = document.querySelector(a.getAttribute("href")); if (s && !s.hidden && s.getBoundingClientRect().top <= y) cur = a; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = navLinks.filter((a) => !document.querySelector(a.getAttribute("href")).hidden).pop();
    navLinks.forEach((a) => { const on = a === cur; a.classList.toggle("active", on); if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    if (cur && cur !== updateActive.last) { updateActive.last = cur; const w = $("#secnavLinks"); const l = cur.offsetLeft - 12; if (l < w.scrollLeft || cur.offsetLeft + cur.offsetWidth > w.scrollLeft + w.clientWidth) w.scrollTo({ left: l, behavior: "smooth" }); }
    $("#secnav").classList.toggle("stuck", $("#secnav").getBoundingClientRect().top <= 0 && window.scrollY > 0);
  }
  let ticking = false;
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; updateActive(); }); } }, { passive: true });
  window.addEventListener("resize", () => requestAnimationFrame(updateActive));
  $("#secnavSeason").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setSeason(b.dataset.v, true); });
  // Season selector (hero): segmented buttons built from data.json seasons; choice kept in ?season=
  function renderSeasonSel() {
    const el = $("#seasonSelect"); if (!el) return;
    el.hidden = seasons.length < 2;
    el.innerHTML = seasons.map((se) => `<button type="button" role="radio" aria-checked="${se === curSeason}" data-v="${esc(se)}" class="${se === curSeason ? "active" : ""}">${esc(se)}</button>`).join("");
    const mini = $("#secnavSeason"); if (mini) { mini.hidden = seasons.length < 2; mini.innerHTML = el.innerHTML; }
  }
  function setSeason(se, push) {
    if (!seasons.includes(se) || (se === curSeason && push)) return;
    curSeason = se;
    const u = new URL(location.href);
    if (se === latestSeason) u.searchParams.delete("season"); else u.searchParams.set("season", se);
    if (push) history.pushState({ season: se }, "", u);
    renderSeasonSel(); render();
  }
  $("#seasonSelect")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setSeason(b.dataset.v, true); });
  window.addEventListener("popstate", () => { curSeason = fromUrl(); renderSeasonSel(); render(); });
  renderSeasonSel(); render();
  requestAnimationFrame(updateActive);
  // Meet-result deep links (#meet-<season>-<slug>): switch season if needed, open, scroll, flash
  function goToMeet(id, smooth) {
    const se = (id.match(/^meet-(\d{4})-/) || [])[1];
    if (se && se !== curSeason && seasons.includes(se)) setSeason(se, true);
    const el = document.getElementById(id); if (!el) return false;
    el.open = true;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "start" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    return true;
  }
  $("#scheduleTable").addEventListener("click", (e) => {
    const a = e.target.closest("a.res-link"); if (!a) return;
    e.preventDefault();
    history.pushState(history.state, "", "#" + a.dataset.meet);
    goToMeet(a.dataset.meet, true);
  });
  const hashMeet = () => { const h = decodeURIComponent(location.hash.slice(1)); if (h.startsWith("meet-")) requestAnimationFrame(() => goToMeet(h, false)); };
  window.addEventListener("hashchange", hashMeet);
  hashMeet();
  if (location.hash.startsWith("#meet-")) { const again = () => setTimeout(() => { const el = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (el) el.scrollIntoView({ behavior: "instant", block: "start" }); }, 150);
    if (document.readyState === "complete") again(); else window.addEventListener("load", again, { once: true }); document.fonts?.ready.then(again); }
  // Season comparison: every season side by side (e.g. 2024 / 2025 / 2026)
  if (seasons.length > 1) {
    const bySeason = Object.fromEntries(seasons.map((se) => [se, bests(valid.filter((r) => r.season === se))]));
    const cmp = { gender: "All", group: "All" };
    const keys = [...new Set(seasons.flatMap((se) => Object.keys(bySeason[se])))];
    const rowsAll = keys.map((k) => { const [ath, ev] = k.split("|"); const cells = seasons.map((se) => bySeason[se][k]); const any = cells.find(Boolean);
      return { ath, ev, cells, field: any.field, group: any.group, gender: genderOf(any), n: cells.filter(Boolean).length }; })
      .sort((a, b) => a.gender.localeCompare(b.gender) || eventOrder(a.ev) - eventOrder(b.ev) || b.n - a.n || a.ath.localeCompare(b.ath));
    const delta = (p, c) => { const d = c.value - p.value; const imp = c.field ? d > 0 : d < 0; const txt = c.field ? `${d > 0 ? "+" : ""}${d.toFixed(1)} in` : `${d > 0 ? "+" : ""}${d.toFixed(2)} s`; return `<span style="color:${d === 0 ? "#5d6b82" : imp ? "#17703d" : "#a33"}">${txt}</span>`; };
    function renderCmp() {
      const rows = rowsAll.filter((r) => (cmp.gender === "All" || r.gender === cmp.gender) && (cmp.group === "All" || r.group === cmp.group) && (cmp.multi ? r.n > 1 : true));
      $("#compareTable").innerHTML = `<thead><tr><th>Athlete</th><th>Event</th>${seasons.map((se) => `<th>${esc(se)} Best</th>`).join("")}<th>Latest change</th><th>Overall change</th></tr></thead><tbody>` +
        (rows.length ? rows.map((r) => { const have = r.cells.filter(Boolean);
          const last = have.length > 1 ? delta(have[have.length - 2], have[have.length - 1]) : "—";
          const overall = have.length > 2 ? delta(have[0], have[have.length - 1]) : "—";
          return `<tr><td>${esc(r.ath)}</td><td>${esc(r.ev)}</td>${r.cells.map((c) => `<td class="mark">${c ? esc(markText(c.mark)) : "—"}</td>`).join("")}<td>${last}</td><td>${overall}</td></tr>`; }).join("")
          : `<tr><td colspan="${seasons.length + 4}" class="empty">No marks match these filters.</td></tr>`) + "</tbody>";
    }
    const segC = (el, opts, key) => { el.innerHTML = opts.map((o) => `<button data-v="${esc(o)}" class="${cmp[key] === o ? "active" : ""}">${esc(o)}</button>`).join("");
      el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; cmp[key] = b.dataset.v; segC(el, opts, key); renderCmp(); }; };
    segC($("#cmpGender"), ["All", "Boys", "Girls"], "gender");
    segC($("#cmpGroup"), groups, "group");
    $("#cmpMulti").onchange = (e) => { cmp.multi = e.target.checked; renderCmp(); };
    $("#compareSeasons").textContent = seasons.join(" · ");
    renderCmp();
    $("#compare").hidden = false;
  }

  // Standards (shown when the Standards tab has rows)
  const std = data.standards || [];
  if (std.length) {
    const cols = Object.keys(std[0]);
    $("#standardsTable").innerHTML = `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${std.map((s) => `<tr>${cols.map((c) => `<td>${esc(s[c])}</td>`).join("")}</tr>`).join("")}</tbody>`;
    $("#standards").hidden = false;
  }

})();
