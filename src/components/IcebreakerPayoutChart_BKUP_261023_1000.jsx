import { useState } from "react";
import { projectedPayout } from "../lib/iceBreakerPromo.js";

// 📈 Ice Breaker payout graph (lib/iceBreakerPromo.js has the model). Every skater in the promo games is a dot:
// across = chance to break the ice (market view by default: DraftKings first-goal odds), up = projected bonus-bet
// payout (log scale). Dashed line = the payout model, shaded = its 80% range. Labeled: the best expected values and
// the market favorites. Tap a dot / label (or search) to pick a player; the table below then shows only him.
const W = 900, H = 430, M = { l: 62, r: 16, t: 16, b: 44 };
const money = (v) => (v == null ? "—" : v >= 10000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v).toLocaleString()}`);
const pctTxt = (p) => `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;

// selectedIds: every player picked (search, a tap on the graph, or a row in the table) — each gets a label.
// onSelect(id) toggles one; onSelect(null) clears all.
export default function IcebreakerPayoutChart({ rows, selectedIds = [], onSelect, opts, xMode }) {
  const [query, setQuery] = useState("");
  const isSel = (id) => selectedIds.includes(id);
  const xOf = (r) => (xMode === "market" ? r.marketP ?? r.iceP : r.iceP);
  const pts = rows.filter((r) => r.payout != null && xOf(r) > 0).sort((a, b) => xOf(b) - xOf(a)).slice(0, 90);
  const scale = (() => {
    if (!pts.length) return null;
    const xs = pts.map(xOf);
    const xMax = Math.max(...xs) * 1.04, xMin = Math.min(...xs) * 0.96;
    const ys = pts.flatMap((r) => [r.payout]);
    const curveY = [projectedPayout(xMax, opts), projectedPayout(xMin, opts)];
    const yMin = Math.max(20, Math.min(...ys, curveY[0].lo) * 0.85), yMax = Math.min(opts.pool, Math.max(...ys, curveY[1].hi) * 1.15);
    const sx = (p) => M.l + ((xMax - p) / (xMax - xMin)) * (W - M.l - M.r); // higher chance on the left
    const sy = (v) => M.t + (1 - (Math.log10(v) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * (H - M.t - M.b);
    return { xMin, xMax, yMin, yMax, sx, sy };
  })();
  if (!scale) return <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>No priced skaters in the promo games yet.</div>;
  const { xMin, xMax, yMin, yMax, sx, sy } = scale;

  // model line + 80% band across the x range
  const N = 40;
  const curve = Array.from({ length: N + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / N).map((p) => ({ p, ...projectedPayout(p, opts) }));
  const clampY = (v) => Math.min(yMax, Math.max(yMin, v));
  const band = [...curve.map((c) => `${sx(c.p)},${sy(clampY(c.hi))}`), ...curve.slice().reverse().map((c) => `${sx(c.p)},${sy(clampY(c.lo))}`)].join(" ");
  const line = curve.map((c) => `${sx(c.p)},${sy(clampY(c.mid))}`).join(" ");

  // labels: top expected values + market favorites + the selected player
  const byEv = [...pts].sort((a, b) => (b.promoEv ?? 0) - (a.promoEv ?? 0)).slice(0, 6);
  const favs = pts.slice(0, 3);
  const labeled = new Map([...favs, ...byEv].map((r) => [r.playerId, r]));
  for (const r of pts) if (isSel(r.playerId)) labeled.set(r.playerId, r);
  const topEv = new Set(byEv.slice(0, 3).map((r) => r.playerId));

  // label boxes: try spots above / below the dot (further out each try), keep the first that overlaps nothing
  const placed = [];
  const boxes = new Map();
  const order = [...labeled.values()].sort((a, b) => isSel(b.playerId) - isSel(a.playerId)); // picked players place first
  for (const r of order) {
    const x = sx(xOf(r)), y = sy(Math.min(yMax, Math.max(yMin, r.payout)));
    const w = Math.max(r.name.length * 6.4, 60) + 10, h = 30;
    let spot = null;
    for (const dy of [-34, 34, -68, 68, -102, 102, -136, 136]) {
      for (const dx of [0, -w * 0.6, w * 0.6, -w * 1.2, w * 1.2]) {
        const cx = Math.min(W - M.r - w / 2, Math.max(M.l + w / 2, x + dx));
        const cy = y + dy;
        if (cy - h / 2 < M.t || cy + h / 2 > H - M.b) continue;
        const box = { x0: cx - w / 2 - 3, x1: cx + w / 2 + 3, y0: cy - h / 2 - 3, y1: cy + h / 2 + 3 };
        if (placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
        spot = { cx, cy, w, x, y };
        placed.push(box);
        break;
      }
      if (spot) break;
    }
    if (spot) boxes.set(r.playerId, spot); // no free spot: the dot stays, its tooltip still names him
  }

  const yTicks = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000].filter((v) => v >= yMin && v <= yMax);
  const xTicks = Array.from({ length: 6 }, (_, i) => xMin + ((xMax - xMin) * i) / 5);
  const matches = query.length >= 2 ? rows.filter((r) => r.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];

  return (
    <div className="card" style={{ padding: 10, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <input className="mono" placeholder="Search players to add to the graph…" value={query} onChange={(e) => setQuery(e.target.value)}
          style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 9px", fontSize: 12, flex: "1 1 200px", minWidth: 160, maxWidth: 320 }} />
        {matches.map((r) => (
          <button key={r.playerId} className={`pill-btn ${isSel(r.playerId) ? "active" : ""}`} style={{ fontSize: 10 }}
            title={isSel(r.playerId) ? "Remove from the graph" : "Add to the graph"} onClick={() => onSelect(r.playerId)}>
            {isSel(r.playerId) ? "✓ " : "+ "}{r.name} <span style={{ color: "var(--muted)" }}>{r.team}</span>
          </button>
        ))}
        {selectedIds.length > 0 && <button className="pill-btn" style={{ fontSize: 10 }} onClick={() => onSelect(null)}>✕ Clear {selectedIds.length} picked</button>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Ice Breaker projected payout by chance">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={M.l - 6} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{money(v)}</text>
          </g>
        ))}
        {xTicks.map((p, i) => (
          <text key={i} x={sx(p)} y={H - M.b + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{pctTxt(p)}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
          ← more likely ({xMode === "market" ? "DraftKings odds" : "our model"}) · less likely, fewer bettors →
        </text>
        <polygon points={band} fill="var(--accent)" opacity="0.10" />
        <polyline points={line} fill="none" stroke="var(--accent2)" strokeWidth="2" strokeDasharray="7 5" />
        {pts.map((r) => {
          const on = isSel(r.playerId);
          return (
            <circle key={r.playerId} cx={sx(xOf(r))} cy={sy(clampY(r.payout))} r={on ? 7 : labeled.has(r.playerId) ? 5 : 3.5}
              fill={on || topEv.has(r.playerId) ? "#d4af37" : labeled.has(r.playerId) ? "var(--accent2)" : "var(--accent)"}
              opacity={on || labeled.has(r.playerId) ? 1 : 0.55} stroke={on ? "#fff" : "none"} strokeWidth="2"
              style={{ cursor: "pointer" }} onClick={() => onSelect(r.playerId)}>
              <title>{`${r.name} (${r.team}) — ${pctTxt(xOf(r))} · projected ${money(r.payout)} (80%: ${money(r.payLo)}–${money(r.payHi)})`}</title>
            </circle>
          );
        })}
        {[...labeled.values()].filter((r) => boxes.has(r.playerId)).map((r) => {
          const { cx: lx, cy: ly, w, x, y } = boxes.get(r.playerId);
          const on = isSel(r.playerId);
          return (
            <g key={`l${r.playerId}`} style={{ cursor: "pointer" }} onClick={() => onSelect(r.playerId)}>
              <line x1={x} y1={y} x2={lx} y2={ly + (ly > y ? -15 : 15)} stroke="var(--muted)" strokeWidth="1" />
              <rect x={lx - w / 2} y={ly - 15} width={w} height={30} rx="5" fill="var(--surface2, #10161d)"
                stroke={on || topEv.has(r.playerId) ? "#d4af37" : "var(--accent)"} strokeWidth={on ? 2 : 1.2} />
              <text x={lx} y={ly - 2} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text, #e8eef4)">{r.name}</text>
              <text x={lx} y={ly + 11} textAnchor="middle" fontSize="10" fill="var(--accent2)">{money(r.payout)} · {r.team}</text>
            </g>
          );
        })}
      </svg>
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
        Dashed line = projected payout for that chance ({opts.entrants.toLocaleString()} entrants, {money(opts.pool)} pool); shaded = 80% range.
        Gold = best expected value tonight (our chance × projected payout). {xMode === "model"
          ? "Across = OUR chance; payouts still come from the DraftKings odds (that's what bettors see), so dots above the line are players we like more than the market does."
          : "Across = the market's chance (DraftKings first-goal odds, vig off, × the game's share of the first goal)."}
        {" "}The payout curve was fitted between ~0.4% and ~1.7% market chance — deep longshots (very high payouts) are an
        extrapolation, and only a handful of people pick them, so one or two extra entrants swing the real number a lot.
        {" "}Search, tap dots / labels, or tap rows in the table to put several players on the graph at once (tap again to remove).
      </div>
    </div>
  );
}
