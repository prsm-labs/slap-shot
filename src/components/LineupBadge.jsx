// Small lineup marker next to a skater's name: ✅ dressed tonight (official lineup), OUT
// (injured per RotoWire), or the power-play unit RotoWire has them on.
// 2026-11-11 line badge: "L1 · PP1" / "D2 · PP2" -- even-strength line or pair (DailyFaceoff) + PP unit (RotoWire, else
// DailyFaceoff). Dashed = projected (shown all day so picks can start early); solid = he's in the official lineup (warmups);
// ▶ = on the ice for the opening faceoff. Context only -- no chance uses it.
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "");
export function lineLabel(line) {
  if (!line) return "";
  return [line.ev, line.pp ? `PP${line.pp}` : null].filter(Boolean).join(" · ");
}
export function LineTag({ line, starting }) {
  const text = lineLabel(line);
  if (!text && !starting) return null;
  const src = line?.source ? (/^last game/i.test(line.source) ? `as in the team's ${line.source.toLowerCase()}` : `per ${line.source}`) : "";
  const title = line?.confirmed
    ? `${text}: projected line, and he is in tonight's official lineup.${starting ? " Starting the game." : ""}`
    : `${text}: projected line (DailyFaceoff${src ? `, ${src}` : ""}${line?.updated ? `, updated ${fmtTime(line.updated)}` : ""}; PP units from RotoWire when posted). Confirmed once the official lineup posts at warmups.`;
  return (
    <span className="mono" title={title}
      style={{ fontSize: 9, padding: "0 4px", borderRadius: 4, marginLeft: 4, whiteSpace: "nowrap",
        border: `1px ${line?.confirmed ? "solid" : "dashed"} var(--accent)`, color: line?.confirmed ? "var(--accent2)" : "var(--muted)" }}>
      {starting ? "▶ " : ""}{text}
    </span>
  );
}

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
      {(status.pp || status.ev) && <LineTag line={{ ev: status.ev, pp: status.pp, confirmed: status.dressed }} />}
    </>
  );
}
