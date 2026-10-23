// Excel-style column resizing for every table.data-table in the app.
// A drag handle is added to the right edge of each header cell (mouse or touch). Widths are remembered in
// localStorage per column NAME, so narrowing "Skater" once narrows it on every page. Double-click / double-tap
// a handle resets that column. Narrowed cells wrap their text (names go onto two lines) and clip anything left.
// Installed once from App.jsx; a MutationObserver picks up tables as pages render.
const KEY = "slapshot.colw.v1";
const MIN_W = 44;

let widths = {};
try { widths = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { widths = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(widths)); } catch { /* storage off: widths last for this visit */ } };

let styleEl = null;
let nextId = 1;
let frame = 0;

// Header text without sort arrows, e.g. "Skater ↓" -> "SKATER".
const colLabel = (th) => (th.textContent || "").replace(/[↓↑]/g, "").trim().toUpperCase();

function headerCells(table) {
  const row = table.tHead?.rows[table.tHead.rows.length - 1];
  return row ? [...row.cells] : [];
}

function rules() {
  let css = "";
  for (const table of document.querySelectorAll("table.data-table[data-rt]")) {
    headerCells(table).forEach((th, i) => {
      const w = widths[colLabel(th)];
      if (!w) return;
      const sel = `table.data-table[data-rt="${table.dataset.rt}"] > * > tr > :nth-child(${i + 1})`;
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
    for (const th of headerCells(table)) {
      if (th.querySelector(":scope > .col-resize")) continue;
      const h = document.createElement("span");
      h.className = "col-resize";
      h.title = "Drag to resize · double-tap to reset";
      h.addEventListener("pointerdown", (e) => startDrag(e, th));
      h.addEventListener("click", (e) => e.stopPropagation()); // don't sort
      th.appendChild(h);
    }
  }
  const css = rules();
  if (styleEl.textContent !== css) styleEl.textContent = css;
}

const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };

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
  const startX = e.clientX;
  const startW = th.getBoundingClientRect().width;
  let moved = false;
  handle.setPointerCapture?.(e.pointerId);
  handle.classList.add("active");
  const move = (ev) => {
    const dx = ev.clientX - startX;
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
  return () => obs.disconnect();
}
