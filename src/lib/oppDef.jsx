// 2026-10-28 Opp D (user: see who has a big chance AND faces a bad defense, on every list, filterable -- CourtIQ / Six Points
// have the same column). Team level: the opponent's expected goals allowed per game (opponentTeamxGA60, the matchup factor
// in lib/grades.js), ranked across the league by the pipeline (_meta.defRank, 1 = softest). Soft = 10 softest, Tough = 10
// stingiest. Defense vs position was tested as noise (2026-10-13). A past night (meta.past, no league ranks saved then) falls
// back to that night's own slate rank.
export const DEF_TIERS = [
  { v: "soft", label: "🟢 Soft", title: "One of the league's 10 softest defenses by expected goals allowed" },
  { v: "avg", label: "Average" },
  { v: "tough", label: "🔴 Tough", title: "One of the league's 10 stingiest defenses by expected goals allowed" },
];
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

export function oppDefOf(p, meta) {
  const r = !meta?.past && meta?.defRank?.[p.opponentTeam];
  if (r) {
    const n = Object.keys(meta.defRank).length;
    return { rank: r.rank, n, xga: r.xga, tier: r.rank <= 10 ? "soft" : r.rank > n - 10 ? "tough" : "avg" };
  }
  const m = p.effectiveGrade?.matchup;
  if (m) return { rank: m.rank, n: m.of, xga: m.xga, slate: true, tier: m.tier || "avg" };
  return { tier: null };
}

// sort value: higher = softer
export const oppDefSort = (p, meta) => { const d = oppDefOf(p, meta); return d.rank != null ? d.n + 1 - d.rank : null; };

export function OppDefCell({ p, meta }) {
  const d = oppDefOf(p, meta);
  if (d.rank == null) return <td className="mono">—</td>;
  const text = d.tier === "soft" ? `${ord(d.rank)} softest` : d.tier === "tough" ? `${ord(d.n - d.rank + 1)} stingiest` : `${ord(d.rank)} of ${d.n}`;
  const color = d.tier === "soft" ? "var(--green)" : d.tier === "tough" ? "var(--red)" : undefined;
  return (
    <td className="mono" style={{ color, whiteSpace: "nowrap" }}
      title={`${p.opponentTeam} allows ${d.xga?.toFixed(2)} expected goals a game — ${ord(d.rank)} softest of ${d.n}${d.slate ? " on that night's slate" : " in the league"}`}>
      {text}
    </td>
  );
}

export const OPP_DEF_NOTE = "Opp D = where tonight's opponent ranks among the league's defenses by expected goals allowed per game (1st softest = allows the most). Green = 10 softest, red = 10 stingiest. Team level: defense vs position tested as noise.";
