import GradeBadge from "./GradeBadge.jsx";
import { useH2HGrades } from "../lib/h2h.js";

// H2H grade + one-line history vs tonight's opponent (lib/h2h.js) — context only, not a prediction.
export default function H2HCell({ playerId, goalie = false, compact = false }) {
  const grades = useH2HGrades();
  const g = (goalie ? grades.goalies : grades.skaters).get(playerId);
  if (!g) return <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>—</span>;
  return (
    <span className="mono" title={`H2H (context, not a prediction): ${g.text}`} style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: compact ? "nowrap" : "normal" }}>
      {g.letter ? <GradeBadge grade={{ letter: g.letter }} /> : <span style={{ color: "var(--muted)" }}>—</span>}
      {!compact && <span style={{ color: "var(--muted)" }}>{g.text}</span>}
    </span>
  );
}
