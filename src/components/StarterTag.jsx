// On the ice for the opening faceoff (official NHL starting lineup, lib/lineups.js).
export default function StarterTag() {
  return (
    <span className="mono" title="Official starting lineup: on the ice for the opening faceoff"
      style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--accent)", color: "var(--accent2)", marginLeft: 4, whiteSpace: "nowrap" }}>
      ▶ STARTING
    </span>
  );
}
