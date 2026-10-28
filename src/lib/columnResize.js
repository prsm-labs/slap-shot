// Table tools for every table.data-table in the app: Excel-style column resizing + a ⚙️ column chooser.
// - Resize: a drag handle on the right edge of each header cell (mouse or touch). Double-click / double-tap resets.
// - ⚙️ (in the pinned first header cell): tick columns on/off. The first column can't be hidden.
// Both are remembered in localStorage per column NAME, so narrowing or hiding "SOG/60" once applies on every
// page that has that column. Narrowed cells wrap their text and clip anything left; hidden columns are display:none.
// Installed once from App.jsx; a MutationObserver picks up tables as pages render. Applied through one generated
// <style> (nth-child per table), so React's own DOM is never restyled directly.
const KEY = "slapshot.colw.v1";
const HIDE_KEY = "slapshot.colhide.v1";
const MIN_W = 44;

const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { return {}; } };
let widths = load(KEY);
let hidden = load(HIDE_KEY);
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(widths));
    localStorage.setItem(HIDE_KEY, JSON.stringify(hidden));
  } catch { /* storage off: settings last for this visit */ }
};

let styleEl = null;
let nextId = 1;
let frame = 0;

// Header text without sort arrows / the gear, e.g. "Skater ↓" -> "SKATER".
const STRIP = /[↓↑]|⚙️?/g;
const colLabel = (th) => (th.textContent || "").replace(STRIP, "").trim().toUpperCase();
const displayLabel = (th) => (th.textContent || "").replace(STRIP, "").trim();

function headerCells(table) {
  const row = table.tHead?.rows[table.tHead.rows.length - 1];
  return row ? [...row.cells] : [];
}

function rules() {
  let css = "";
  for (const table of document.querySelectorAll("table.data-table[data-rt]")) {
    headerCells(table).forEach((th, i) => {
      const label = colLabel(th);
      const sel = `table.data-table[data-rt="${table.dataset.rt}"] > * > tr > :nth-child(${i + 1})`;
      if (i > 0 && hidden[label]) { css += `${sel}{display:none;}\n`; return; }
      const w = widths[label];
      if (!w) return;
      const pad = w < 140 ? "padding-left:6px;padding-right:6px;" : "";
      css += `${sel}{width:${w}px;min-width:${w}px;max-width:${w}px;white-space:normal;overflow:hidden;overflow-wrap:break-word;${pad}}\n`;
    });
  }
  return css;
}

function apply() {
  frame = 0;
  for (const table of document.querySelectorAll("table.data-table")) {
    if (!table.dataset.rt) table.dataset.rt = String(nextId++);
    const cells = headerCells(table);
    cells.forEach((th, i) => {
      if (i === 0 && cells.length > 2 && !th.querySelector(":scope > .col-gear")) {
        const g = document.createElement("button");
        g.type = "button";
        g.className = "col-gear";
        g.textContent = "⚙️";
        g.title = "Choose columns";
        g.addEventListener("click", (e) => { e.stopPropagation(); openChooser(table, g); });
        th.insertBefore(g, th.firstChild);
      }
      if (th.querySelector(":scope > .col-resize")) return;
      const h = document.createElement("span");
      h.className = "col-resize";
      h.title = "Drag to resize · double-tap to reset";
      h.addEventListener("pointerdown", (e) => startDrag(e, th));
      h.addEventListener("click", (e) => e.stopPropagation()); // don't sort
      th.appendChild(h);
    });
  }
  const css = rules();
  if (styleEl.textContent !== css) styleEl.textContent = css;
}

const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };

// ── Resize ──────────────────────────────────────────────────────────────────
let lastTap = { label: null, t: 0 };
function startDrag(e, th) {
  e.preventDefault();
  e.stopPropagation();
  const label = colLabel(th);
  const now = Date.now();
  if (lastTap.label === label && now - lastTap.t < 350) {
    delete widths[label];
    lastTap = { label: null, t: 0 };
    save();
    apply();
    return;
  }
  lastTap = { label, t: now };
  const handle = e.currentTarget;
  // window pixels -> page pixels (big-screen zoom, 2026-10-28)
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const startX = e.clientX;
  const startW = th.getBoundingClientRect().width / z;
  let moved = false;
  handle.setPointerCapture?.(e.pointerId);
  handle.classList.add("active");
  const move = (ev) => {
    const dx = (ev.clientX - startX) / z;
    if (!moved && Math.abs(dx) < 3) return;
    moved = true;
    widths[label] = Math.max(MIN_W, Math.round(startW + dx));
    apply();
  };
  const up = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
    handle.classList.remove("active");
    if (moved) { lastTap = { label: null, t: 0 }; save(); }
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
}

// ── Column chooser ──────────────────────────────────────────────────────────
let panel = null;
function closeChooser() {
  if (!panel) return;
  panel.remove();
  panel = null;
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", closeChooser);
}
const outside = (e) => { if (panel && !panel.contains(e.target) && !e.target.closest?.(".col-gear")) closeChooser(); };
const onKey = (e) => { if (e.key === "Escape") closeChooser(); };

function openChooser(table, gear) {
  if (panel) { const same = panel.dataset.rt === table.dataset.rt; closeChooser(); if (same) return; }
  panel = document.createElement("div");
  panel.className = "col-chooser";
  panel.dataset.rt = table.dataset.rt;
  const render = () => {
    const cols = headerCells(table).slice(1).map((th) => ({ label: colLabel(th), text: displayLabel(th) }));
    const nHidden = cols.filter((c) => hidden[c.label]).length;
    panel.innerHTML = "";
    const head = document.createElement("div");
    head.className = "col-chooser-head";
    head.textContent = `Columns · ${cols.length - nHidden} of ${cols.length} shown`;
    panel.appendChild(head);
    const list = document.createElement("div");
    list.className = "col-chooser-list";
    for (const c of cols) {
      const row = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !hidden[c.label];
      box.addEventListener("change", () => {
        if (box.checked) delete hidden[c.label]; else hidden[c.label] = 1;
        save(); apply(); render();
      });
      row.appendChild(box);
      row.appendChild(document.createTextNode(c.text || c.label));
      list.appendChild(row);
    }
    panel.appendChild(list);
    const foot = document.createElement("div");
    foot.className = "col-chooser-foot";
    const btn = (text, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "pill-btn"; b.textContent = text; b.addEventListener("click", fn); foot.appendChild(b); };
    btn("Show all", () => { for (const c of cols) delete hidden[c.label]; save(); apply(); render(); });
    btn("Reset widths", () => { for (const c of [...cols, { label: colLabel(headerCells(table)[0]) }]) delete widths[c.label]; save(); apply(); });
    btn("Done", closeChooser);
    panel.appendChild(foot);
    const note = document.createElement("div");
    note.className = "col-chooser-note";
    note.textContent = "Saved on this device. Applies to every table with the same column.";
    panel.appendChild(note);
  };
  render();
  document.body.appendChild(panel);
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1; // big-screen zoom: window -> page pixels
  const g = gear.getBoundingClientRect();
  const r = { left: g.left / z, top: g.top / z, bottom: g.bottom / z };
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth / z - pw - 8));
  const below = r.bottom + 6;
  const top = below + ph > window.innerHeight / z - 8 ? Math.max(8, r.top - ph - 6) : below;
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", closeChooser);
}

export function resetColumnWidths() {
  widths = {};
  save();
  if (styleEl) apply();
}

export function installColumnResize() {
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "col-resize-widths";
    document.head.appendChild(styleEl);
  }
  const obs = new MutationObserver(schedule);
  obs.observe(document.body, { childList: true, subtree: true });
  schedule();
  return () => { obs.disconnect(); closeChooser(); };
}
