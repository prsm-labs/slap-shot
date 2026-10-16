// "Last 120 min" cell (lib/last120.js): rate per 60 over the most recent ~120 minutes of ice time, and how it
// compares with the season rate ("1.4x", bright at 1.2x or more). kind = "sog" | "hd" | "a" | "p".
// Columns: lib/last120.js L120_COLS (4th field = kind).
const KINDS = {
  sog: ["sog120", "sog120x", "sog120Count", "sog60Season", "shots on goal"],
  hd: ["hd120", "hd120x", "hd120Count", "hd60Season", "high-danger attempts"],
  a: ["a120", "a120x", "a120Count", "a60Season", "assists"],
  p: ["p120", "p120x", "p120Count", "p60Season", "points"],
};

export default function L120Cell({ p, kind }) {
  const [rk, xk, ck, sk, label] = KINDS[kind] || KINDS.sog;
  const rate = p[rk];
  const ratio = p[xk];
  if (rate == null) return <td className="mono" title="Under 90 minutes on ice in the recent games log">—</td>;
  const count = p[ck];
  const season = p[sk];
  const title = `${count} ${label} in the last ${p.l120Min} min on ice = ${rate.toFixed(1)}/60` +
    (season != null ? ` (season ${season.toFixed(kind === "a" || kind === "p" ? 2 : 1)}/60)` : "");
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
