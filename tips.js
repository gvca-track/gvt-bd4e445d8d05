// Accessible tooltips: hover/focus on desktop, tap on touch; delegated for dynamic content.
(() => {
  const tip = document.createElement("div");
  tip.className = "tip"; tip.id = "gv-tip"; tip.setAttribute("role", "tooltip"); tip.hidden = true;
  document.body.appendChild(tip);
  let cur = null, pinned = false;
  const show = (el) => {
    cur = el; tip.textContent = el.dataset.tip; tip.hidden = false;
    el.setAttribute("aria-describedby", "gv-tip");
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2 + scrollX;
    x = Math.max(scrollX + 6, Math.min(x, scrollX + document.documentElement.clientWidth - t.width - 6));
    let y = r.top + scrollY - t.height - 8;
    if (r.top - t.height - 8 < 0) y = r.bottom + scrollY + 8;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  };
  const hide = () => { if (cur) cur.removeAttribute("aria-describedby"); cur = null; pinned = false; tip.hidden = true; };
  const find = (e) => e.target.closest && e.target.closest("[data-tip]");
  document.addEventListener("mouseover", (e) => { const el = find(e); if (el && !pinned) show(el); });
  document.addEventListener("mouseout", (e) => { const el = find(e); if (el && !pinned && !el.contains(e.relatedTarget)) hide(); });
  document.addEventListener("focusin", (e) => { const el = find(e); if (el) show(el); });
  document.addEventListener("focusout", (e) => { if (find(e) && !pinned) hide(); });
  document.addEventListener("click", (e) => {
    const el = find(e);
    if (el) { if (pinned && cur === el) hide(); else { show(el); pinned = true; } }
    else if (cur) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
    else if ((e.key === "Enter" || e.key === " ") && find(e)) { e.preventDefault(); show(find(e)); pinned = true; }
  });
  addEventListener("scroll", () => { if (cur && !pinned) hide(); else if (cur) show(cur); }, { passive: true });
})();
