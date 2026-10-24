import { GRADE_COLOR, GRADE_COLOR_LIGHT } from "../lib/grades.js";
import { isLight } from "../lib/theme.js";

export default function GradeBadge({ grade, title }) {
  if (!grade) return <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>—</span>;
  const color = (isLight() ? GRADE_COLOR_LIGHT : GRADE_COLOR)[grade.letter] || "var(--muted)";
  return (
    <span
      title={grade.tooltip || title}
      className="mono"
      style={{
        display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
        color, border: `1px solid ${color}55`, background: `${color}1a`,
      }}
    >
      {grade.letter}
      {/* skater grades only: ▲ / ▼ = opponent in tonight's softest / stingiest third of defenses */}
      {grade.matchup?.tier === "soft" && <span style={{ fontSize: 8, marginLeft: 3, color: "var(--accent2)" }}>▲</span>}
      {grade.matchup?.tier === "tough" && <span style={{ fontSize: 8, marginLeft: 3, color: "var(--muted)" }}>▼</span>}
    </span>
  );
}
