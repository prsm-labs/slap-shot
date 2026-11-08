// 📱 Phone cards (2026-11-03, user: tables are hard to read on a phone -- condense them like Outlier's prop cards, no odds focus).
// Same file in CourtIQ, Slap Shot, Six Points and Final Lap, started once from main.jsx. On a screen 640 px wide or less every list
// table (5+ columns, 2+ rows) turns into one card per row: the first cell (player + his ＋ My Picks button) on top, the sorted column
// as the big number on the right, every other column as a labelled cell underneath; the header row becomes a scrolling row of sort
// chips (the same buttons, so tapping one still sorts). Wider screens -- a phone turned sideways, an iPad, a desktop -- keep the
// tables. Cards show the first 8 columns plus Opp D, last-N hit rates and the big number (Table view has the rest).
// A "Table view" chip above each card list switches every list back (remembered in this browser).
// Only data attributes are added to the table's own nodes (React never sets them), plus one toggle chip placed before the table.
// 2026-11-05 (user: lists ran 65-104 phone screens): on a phone a list longer than CAP rows shows its first CAP (cards or table) and a
// "Show all N" button after it; sorting and filters still work on the whole list (the hidden rows are only hidden). Wider screens: no cap.
const KEY = "degen.tableMode";
const SKIP = ".mini, .box-table, .nbs-t, .nhs-t, .gs-t, .pl-table, .no-cards";
const MIN_COLS = 5;
const ARROWS = /[↓↑▲▼]|⚙️?/g;
const CAP = 25;
const openCaps = new WeakSet();

let mode = (() => { try { return localStorage.getItem(KEY) || "cards"; } catch { return "cards"; } })();
let frame = 0;
const phone = window.matchMedia("(max-width: 640px)");

function headerRow(table) {
  const h = table.tHead;
  return h && h.rows.length ? h.rows[h.rows.length - 1] : null;
}

function qualifies(table) {
  if (table.matches(SKIP) || table.closest(".rb-ladder, .no-cards")) return false;
  const hr = headerRow(table);
  if (!hr || hr.cells.length < MIN_COLS) return false;
  const body = table.tBodies[0];
  return Boolean(body && body.rows.length >= 2);
}

function primaryIndex(cells) {
  const band = (th) => th.classList.contains("tc-band");
  const fixed = cells.findIndex((th, i) => i > 0 && th.classList.contains("tc-prim"));  // a page can name its big number (labs with a prop band)
  if (fixed > 0) return fixed;
  // 2026-11-08: Six Points' sort headers mark the column with a ▼ / ▲ .sort-arrow (not ↓ / ↑), so its cards kept the first % column
  const sorted = cells.findIndex((th, i) => i > 0 && !band(th) && (th.classList.contains("sorted") || th.querySelector(".sort-arrow") || /[↓↑▲▼]/.test(th.textContent || "")));
  if (sorted > 0) return sorted;
  return cells.findIndex((th, i) => i > 0 && !band(th) && /%/.test(th.textContent || ""));
}

function setMode(m) {
  mode = m;
  try { localStorage.setItem(KEY, m); } catch { /* storage off: this visit only */ }
  schedule();
}

function toggleFor(table, on) {
  let t = table.previousElementSibling;
  if (t && !t.hasAttribute("data-tc-toggle")) t = null;
  if (!phone.matches) { t?.remove(); return; }
  if (!t) {
    t = document.createElement("div");
    t.setAttribute("data-tc-toggle", "");
    t.innerHTML = '<button type="button" data-m="cards">Cards</button><button type="button" data-m="table">Table</button>';
    t.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); });
    table.parentNode.insertBefore(t, table);
  }
  for (const b of t.querySelectorAll("button")) b.classList.toggle("on", (b.dataset.m === "cards") === on);
}

function capFor(table) {
  let b = table.nextElementSibling;
  if (b && !b.hasAttribute("data-tc-cap")) b = null;
  const n = table.tBodies[0]?.rows.length || 0;
  if (!phone.matches || n <= CAP) {
    b?.remove();
    if (table.hasAttribute("data-cap")) table.removeAttribute("data-cap");
    return;
  }
  const open = openCaps.has(table);
  if (!table.hasAttribute("data-cap")) table.setAttribute("data-cap", "");
  if (open !== table.hasAttribute("data-cap-open")) { if (open) table.setAttribute("data-cap-open", ""); else table.removeAttribute("data-cap-open"); }
  if (!b) {
    b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-tc-cap", "");
    b.addEventListener("click", () => {
      const t = b.previousElementSibling;
      if (!t || t.tagName !== "TABLE") return;
      if (openCaps.has(t)) { openCaps.delete(t); t.scrollIntoView({ block: "start" }); } else openCaps.add(t);
      schedule();
    });
    table.parentNode.insertBefore(b, table.nextSibling);
  }
  const label = open ? `▴ Show the top ${CAP}` : `▾ Show all ${n}`;
  if (b.textContent !== label) b.textContent = label;
}

function apply() {
  frame = 0;
  for (const t of document.querySelectorAll("[data-tc-toggle]")) {
    const nx = t.nextElementSibling;
    if (!nx || nx.tagName !== "TABLE") t.remove();
  }
  for (const b of document.querySelectorAll("[data-tc-cap]")) {
    const pv = b.previousElementSibling;
    if (!pv || pv.tagName !== "TABLE") b.remove();
  }
  for (const table of document.querySelectorAll("table")) {
    if (!qualifies(table)) {
      if (table.hasAttribute("data-cards")) table.removeAttribute("data-cards");
      if (table.hasAttribute("data-cap")) table.removeAttribute("data-cap");
      if (table.nextElementSibling?.hasAttribute("data-tc-cap")) table.nextElementSibling.remove();
      continue;
    }
    const on = phone.matches && mode === "cards";
    toggleFor(table, on);
    capFor(table);
    if (!on) { if (table.hasAttribute("data-cards")) table.removeAttribute("data-cards"); continue; }
    const cells = [...headerRow(table).cells];
    const labels = cells.map((th) => (th.textContent || "").replace(ARROWS, "").trim());
    const prim = primaryIndex(cells);
    if (table.getAttribute("data-cards") !== "1") table.setAttribute("data-cards", "1");
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        const full = tr.cells.length === 1 || [...tr.cells].some((c) => c.colSpan > 1);
        if (full) { if (!tr.hasAttribute("data-tc-full")) tr.setAttribute("data-tc-full", ""); continue; }
        [...tr.cells].forEach((td, i) => {
          const l = labels[i] || "";
          if (td.getAttribute("data-label") !== l) td.setAttribute("data-label", l);
          const k = /^(OPP D|L\d+)/i.test(l);
          if (k !== td.hasAttribute("data-keep")) { if (k) td.setAttribute("data-keep", ""); else td.removeAttribute("data-keep"); }
          const p = i === prim;
          if (p !== td.hasAttribute("data-primary")) { if (p) td.setAttribute("data-primary", ""); else td.removeAttribute("data-primary"); }
          // a cell with a photo (e.g. Slap Shot's Opp Goalie: photo + name + grade) gets two card columns so the name isn't split mid-word
          const w = i > 0 && !p && !td.classList.contains("tc-band") && !!td.querySelector("img");
          if (w !== td.hasAttribute("data-wide")) { if (w) td.setAttribute("data-wide", ""); else td.removeAttribute("data-wide"); }
        });
        const has = prim > 0;
        if (has !== tr.hasAttribute("data-tc-prim")) { if (has) tr.setAttribute("data-tc-prim", ""); else tr.removeAttribute("data-tc-prim"); }
      }
    }
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(apply);
}

export function startTableCards() {
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  phone.addEventListener?.("change", schedule);
  schedule();
}
