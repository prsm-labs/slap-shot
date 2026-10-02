// Small lineup marker next to a skater's name: ✅ dressed tonight (official lineup), OUT
// (injured per RotoWire), or the power-play unit RotoWire has them on.
export default function LineupBadge({ status }) {
  if (!status) return null;
  if (status.out) {
    return (
      <span className="mono" title={`Out: ${status.out}`} style={{ fontSize: 9, fontWeight: 700, color: "var(--red)", marginLeft: 4 }}>
        OUT
      </span>
    );
  }
  return (
    <>
      {status.dressed && <span title="In tonight's official lineup" style={{ marginLeft: 4 }}>✅</span>}
      {status.pp && (
        <span className="mono" title={`Power-play unit ${status.pp} (RotoWire)`} style={{ fontSize: 9, color: "var(--accent2)", marginLeft: 4 }}>
          PP{status.pp}
        </span>
      )}
    </>
  );
}
