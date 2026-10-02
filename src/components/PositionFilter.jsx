import { POSITION_OPTIONS, setPosition, usePosition } from "../lib/positionFilter.js";

// Chip row for the shared position filter (lib/positionFilter.js).
export default function PositionFilter() {
  const selected = usePosition();
  return (
    <div className="pill-row" style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 12, marginRight: 10 }}>
      {POSITION_OPTIONS.map((o) => (
        <button
          key={o.label}
          className={`pill-btn ${selected === o.key ? "active" : ""}`}
          onClick={() => setPosition(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
