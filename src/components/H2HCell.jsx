import GradeBadge from "./GradeBadge.jsx";
import { useH2HGrades } from "../lib/h2h.js";

// H2H grade vs tonight's opponent (lib/h2h.js) — context only, not a prediction. The one-line history is the
// hover tooltip; the numbers live in the sortable columns below (H2HStatCell).
export default function H2HCell({ playerId, goalie = false }) {
  const grades = useH2HGrades();
  const g = (goalie ? grades.goalies : grades.skaters).get(playerId);
  if (!g) return <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>—</span>;
  return (
    <span className="mono" title={`H2H (context, not a prediction): ${g.text}`} style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 2, whiteSpace: "nowrap", cursor: "help" }}>
      {g.letter ? <GradeBadge grade={{ letter: g.letter }} /> : <span style={{ color: "var(--muted)" }}>—</span>}
      {g.letter && g.small && <span title="Small sample: under 4 games vs this team and under 15 shots on this goalie" style={{ color: "var(--muted)" }}>*</span>}
    </span>
  );
}

const muted = { color: "var(--muted)" };
const sv = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));

export function H2HStatCell({ playerId, stat, goalie = false }) {
  const grades = useH2HGrades();
  const g = (goalie ? grades.goalies : grades.skaters).get(playerId);
  const s = g?.[stat];
  if (!s || !s.n) return <span className="mono" style={{ fontSize: 10, ...muted }}>—</span>;
  const tag = stat === "venue" ? `${(goalie ? g.venueSide : s.side) === "home" ? "H" : "A"} ` : "";
  if (goalie) {
    return (
      <span className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }} title={`${s.n} GP, ${s.sa} shots`}>
        {tag}{sv(s.sv)} <span style={{ fontSize: 9, ...muted }}>({s.n})</span>
      </span>
    );
  }
  return (
    <span className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }} title={`${s.made} of ${s.n} games${s.label ? ` vs ${s.label}` : ""}`}>
      {tag}{Math.round((s.made / s.n) * 100)}% <span style={{ fontSize: 9, ...muted }}>({s.made}/{s.n})</span>
    </span>
  );
}
