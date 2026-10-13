import { dueHeatText } from "../lib/dueHeat.js";

// 🔥 DUE tag (lib/dueHeat.js): no goal in 2+ games, expected goals rising, soft defense tonight, not a top scorer.
export default function DueTag({ due }) {
  if (!due) return null;
  return (
    <span className="mono" title={dueHeatText(due)}
      style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--accent)", color: "var(--accent2)", marginLeft: 4, whiteSpace: "nowrap" }}>
      🔥 DUE
    </span>
  );
}
