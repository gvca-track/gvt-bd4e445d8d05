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
  const curSeason = seasons[seasons.length - 1] || "";
  const athletesByName = Object.fromEntries((data.athletes || []).map((a) => [a.name, a]));
  const eventOrder = (e) => { const g = ["Sprints", "Distance", "Hurdles", "Relays", "Jumps", "Throws", "Other"].indexOf(groupOf(e)); const n = parseInt(e) || 0; return g * 100000 + n; };
  function groupOf(e) { const r = results.find((x) => x.event === e); return r ? r.group : "Other"; }
  const fmtDate = (iso, opts) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { timeZone: TZ, ...opts }) : "";
  const initials = (n) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("");
  const tags = (r) => (r.qualified ? '<span class="tag q">Q</span>' : "") + (r.record ? '<span class="tag r">R</span>' : "") + (r.fat ? '<span class="tag a" title="Fully automatic timing">FAT</span>' : "");
  const markText = (m) => String(m).replace(/[aQR]+$/, "");

  // best mark per athlete+event (+season)
  function bests(list) {
    const map = {};
    for (const r of list) {
      const k = r.athlete + "|" + r.event;
      if (!map[k] || better(r.value, map[k].value, r.field) || (r.value === map[k].value && (r.date || "") < (map[k].date || ""))) map[k] = r;
    }
    return map;
  }
  const curResults = valid.filter((r) => r.season === curSeason);
  const curBests = bests(curResults);
  const prSet = new Set(Object.values(curBests));

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
    [(data.athletes || []).length, "Athletes"],
    [results.filter((r) => r.season === curSeason).length, "Marks Recorded"],
    [meetsCompeted, "Meets Competed"],
    [events.length, "Events Contested"],
    [wins, "Event Wins"],
  ];
  $("#stats").innerHTML = stats.map(([n, l]) => `<div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`).join("");

  // PR board
  const state = { gender: "All", group: "All" };
  const genders = ["All", ...new Set((data.athletes || []).map((a) => a.gender).filter(Boolean))];
  const groups = ["All", ...new Set(curResults.map((r) => r.group))];
  function seg(el, opts, key) {
    el.innerHTML = opts.map((o) => `<button data-v="${esc(o)}" class="${state[key] === o ? "active" : ""}">${esc(o)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state[key] = b.dataset.v; seg(el, opts, key); renderPR(); };
  }
  seg($("#genderFilter"), genders, "gender");
  seg($("#groupFilter"), groups, "group");
  function renderPR() {
    const rows = Object.values(curBests).filter((r) => {
      const a = athletesByName[r.athlete] || {};
      return (state.gender === "All" || a.gender === state.gender) && (state.group === "All" || r.group === state.group);
    });
    const byEv = {};
    rows.forEach((r) => { const g = (athletesByName[r.athlete] || {}).gender || ""; const k = (g ? g + " " : "") + r.event; (byEv[k] = byEv[k] || { ev: r.event, g, list: [] }).list.push(r); });
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
  const charts = [];
  const sortedAth = [...(data.athletes || [])].sort((a, b) => a.gender.localeCompare(b.gender) || a.name.split(" ").pop().localeCompare(b.name.split(" ").pop()));
  $("#athleteGrid").innerHTML = sortedAth.map((a, i) => {
    const mine = curResults.filter((r) => r.athlete === a.name);
    const evs = [...new Set(mine.map((r) => r.event))].sort((x, y) => eventOrder(x) - eventOrder(y));
    const chips = evs.map((e) => { const b = curBests[a.name + "|" + e]; return `<div class="chip">${esc(e)}<b>${esc(markText(b.mark))}</b></div>`; }).join("");
    return `<article class="card athlete"><div class="ath-head"><div class="avatar">${esc(initials(a.name))}</div>
      <div><h3>${esc(a.name)}</h3><div class="ath-meta">${esc(a.gender)} · Grade ${esc(a.grade)} · ${mine.length} mark${mine.length === 1 ? "" : "s"}</div></div></div>
      <div class="ath-prs">${chips || '<span class="muted">No marks yet</span>'}</div>
      ${evs.length ? `<div class="ev-tabs" data-i="${i}">${evs.map((e, j) => `<button class="${j === 0 ? "active" : ""}" data-e="${esc(e)}">${esc(e)}</button>`).join("")}</div><div class="chart-box"><canvas id="ch${i}"></canvas></div>` : ""}
    </article>`;
  }).join("");
  function drawChart(i, ev) {
    const a = sortedAth[i];
    const pts = curResults.filter((r) => r.athlete === a.name && r.event === ev).sort((x, y) => (x.date || "").localeCompare(y.date || "") || (x.round === "Prelim" ? -1 : 1));
    const field = pts[0]?.field;
    const ctx = document.getElementById("ch" + i);
    if (!ctx || !window.Chart) return;
    if (charts[i]) charts[i].destroy();
    const best = curBests[a.name + "|" + ev];
    charts[i] = new Chart(ctx, {
      type: "line",
      data: { labels: pts.map((p) => fmtDate(p.date, { month: "short", day: "numeric" }) + (p.round === "Prelim" ? " (P)" : "")),
        datasets: [{ data: pts.map((p) => p.value), borderColor: "#0b1f3a", backgroundColor: "rgba(201,162,39,.15)", fill: false, cubicInterpolationMode: "monotone", borderWidth: 2.5,
          pointRadius: pts.map((p) => (p === best ? 7 : 4)), pointBackgroundColor: pts.map((p) => (p === best ? "#c9a227" : "#0b1f3a")), pointBorderColor: "#fff", pointBorderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false },
          tooltip: { callbacks: { title: (c) => pts[c[0].dataIndex].meet, label: (c) => `${markText(pts[c.dataIndex].mark)}  (${pts[c.dataIndex].dateLabel})` } } },
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
  const initCharts = () => document.querySelectorAll(".ev-tabs").forEach((t) => drawChart(+t.dataset.i, t.querySelector("button").dataset.e));
  if (window.Chart) initCharts(); else window.addEventListener("load", initCharts);

  // Season comparison (shown when results span 2+ seasons)
  if (seasons.length > 1) {
    const prev = seasons[seasons.length - 2];
    const prevBests = bests(valid.filter((r) => r.season === prev));
    const keys = [...new Set([...Object.keys(prevBests), ...Object.keys(curBests)])].sort();
    $("#compareTable").innerHTML = `<thead><tr><th>Athlete</th><th>Event</th><th>${esc(prev)} Best</th><th>${esc(curSeason)} Best</th><th>Change</th></tr></thead><tbody>` +
      keys.map((k) => { const p = prevBests[k], c = curBests[k]; const [ath, ev] = k.split("|");
        let ch = "—"; if (p && c) { const d = c.value - p.value; const imp = c.field ? d > 0 : d < 0; ch = `<span style="color:${imp ? "#17703d" : "#a33"}">${d > 0 ? "+" : ""}${d.toFixed(2)}${c.field ? " in" : " s"}</span>`; }
        return `<tr><td>${esc(ath)}</td><td>${esc(ev)}</td><td class="mark">${p ? esc(markText(p.mark)) : "—"}</td><td class="mark">${c ? esc(markText(c.mark)) : "—"}</td><td>${ch}</td></tr>`; }).join("") + "</tbody>";
    $("#compare").hidden = false;
  }

  // Standards (shown when the Standards tab has rows)
  const std = data.standards || [];
  if (std.length) {
    const cols = Object.keys(std[0]);
    $("#standardsTable").innerHTML = `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${std.map((s) => `<tr>${cols.map((c) => `<td>${esc(s[c])}</td>`).join("")}</tr>`).join("")}</tbody>`;
    $("#standards").hidden = false;
  }

  // Meet results grouped by meet
  const meetMap = {};
  results.forEach((r) => { const k = r.meet + "|" + r.season; (meetMap[k] = meetMap[k] || { name: r.meet, date: r.date, label: r.dateLabel, list: [] }).list.push(r); if ((r.date || "") < (meetMap[k].date || "~")) meetMap[k].date = r.date; });
  const meetInfo = Object.fromEntries((data.meets || []).map((m) => [m.name, m]));
  const meetsSorted = Object.values(meetMap).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  $("#meetResults").innerHTML = meetsSorted.length ? meetsSorted.map((m, i) => {
    m.list.sort((a, b) => eventOrder(a.event) - eventOrder(b.event) || a.event.localeCompare(b.event) || (a.round === "Prelim" ? -1 : 1) || (a.value ?? 1e9) - (b.value ?? 1e9));
    const loc = meetInfo[m.name]?.location;
    const dt = m.date ? new Date(m.date + "T12:00:00") : null;
    return `<details class="card meet" ${i === 0 ? "open" : ""}><summary>
      <div class="datebox"><div class="m">${dt ? dt.toLocaleString("en-US", { month: "short", timeZone: TZ }) : ""}</div><div class="d">${dt ? dt.getDate() : "—"}</div></div>
      <div class="meet-title"><h3>${esc(m.name)}</h3><div>${esc(m.label)}${loc ? " · " + esc(loc) : ""}</div></div>
      <span class="count">${m.list.length} mark${m.list.length === 1 ? "" : "s"}</span>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary>
      <div class="table-wrap"><table><thead><tr><th>Event</th><th>Athlete</th><th>Mark</th><th>Place</th><th>Round</th><th>Wind</th></tr></thead><tbody>
      ${m.list.map((r) => `<tr><td>${esc(r.event)}</td><td>${esc(r.athlete)}</td><td class="mark">${esc(markText(r.mark))}${tags(r)}${prSet.has(r) ? '<span class="pr-flag">PR</span>' : ""}</td><td>${esc(r.place) || "—"}</td><td>${esc(r.round)}</td><td>${esc(r.wind) || "—"}</td></tr>`).join("")}
      </tbody></table></div></details>`;
  }).join("") : "";
  if (!meetsSorted.length) $("#results").hidden = true;

  // Schedule
  const meets = data.meets || [];
  if (!meets.length) $("#schedule").hidden = true;
  else {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const nextIdx = meets.findIndex((m) => m.date && m.date >= today);
    $("#scheduleTable").innerHTML = `<thead><tr><th>Date</th><th>Day</th><th>Time</th><th>Meet / Event</th><th>Location</th><th>Status</th></tr></thead><tbody>` +
      meets.map((m, i) => `<tr class="${m.date && m.date < today ? "past" : ""} ${i === nextIdx ? "next" : ""}">
        <td><b>${fmtDate(m.date, { month: "short", day: "numeric", year: "numeric" })}</b></td><td>${esc(m.day)}</td><td>${esc(m.time) || "TBA"}</td>
        <td><b style="color:var(--navy)">${esc(m.name)}</b></td><td>${esc(m.location) || "TBA"}</td>
        <td><span class="status ${m.status ? "" : "tbd"}">${esc(m.status || "TBD")}</span></td></tr>`).join("") + "</tbody>";
  }
})();
