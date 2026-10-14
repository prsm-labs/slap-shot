import { pointHeatText } from "../lib/pointHeat.js";

// 🍎 DUE tag (lib/pointHeat.js): no point in 2+ games, on-ice expected goals rising, not a top-25% point chance.
export default function PointDueTag({ heat }) {
  if (!heat) return null;
  return (
    <span className="mono" title={pointHeatText(heat)}
      style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--accent)", color: "var(--accent2)", marginLeft: 4, whiteSpace: "nowrap" }}>
      🍎 PTS DUE
    </span>
  );
}
