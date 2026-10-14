// "Last 120 min" cell (lib/last120.js): rate per 60 over the most recent ~120 minutes of ice time, and how it
// compares with the season rate ("1.4x", bright at 1.2x or more). kind = "sog" | "hd". Columns: lib/last120.js L120_COLS.

export default function L120Cell({ p, kind }) {
  const rate = kind === "hd" ? p.hd120 : p.sog120;
  const ratio = kind === "hd" ? p.hd120x : p.sog120x;
  if (rate == null) return <td className="mono" title="Under 90 minutes on ice in the recent games log">—</td>;
  const count = kind === "hd" ? p.hd120Count : p.sog120Count;
  const season = kind === "hd" ? p.hd60Season : p.sog60Season;
  const label = kind === "hd" ? "high-danger attempts" : "shots on goal";
  const title = `${count} ${label} in the last ${p.l120Min} min on ice = ${rate.toFixed(1)}/60` +
    (season != null ? ` (season ${season.toFixed(1)}/60)` : "");
  return (
    <td className="mono" title={title} style={{ whiteSpace: "nowrap" }}>
      {rate.toFixed(1)}
      {ratio != null && (
        <span style={{ marginLeft: 4, fontSize: 10, color: ratio >= 1.2 ? "var(--accent2)" : "var(--muted)", fontWeight: ratio >= 1.2 ? 700 : 400 }}>
          {ratio.toFixed(1)}x
        </span>
      )}
    </td>
  );
}
