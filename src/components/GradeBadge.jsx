import { GRADE_COLOR } from "../lib/grades.js";

export default function GradeBadge({ grade, title }) {
  if (!grade) return <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>—</span>;
  const color = GRADE_COLOR[grade.letter] || "var(--muted)";
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
    </span>
  );
}
