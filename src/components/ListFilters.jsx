import FilterPanel, { withCounts } from "./FilterPanel.jsx";
import { buildGroups, clearListFilters, setListFilter, useListFilters } from "../lib/listFilters.js";
import { saveFilter } from "../lib/savedFilters.js";
import { usePosition } from "../lib/positionFilter.js";

// 2026-11-06 🔒 Locked in (user): effective grade A+ to C + one of the 10 softest defenses (xGA), one tap. Tested first (2023-26 held
// out, 16.6k skater-nights): 17.9% hit vs 16.6% said on rows scored WITHOUT the opponent; the soft-D lift (~+1.2 pts) is about what the
// live matchup factor (0.114 / SD of opp xGA) already adds, so on the app's own % they hit about what it says. H2H added nothing, left out.
const LOCKED_IN = [{ key: "locked", label: "🔒 Locked in", set: { grades: ["A+", "A", "B", "C"], oppd: ["soft"] },
  title: "Grade A+ to C facing one of the league's 10 softest defenses — the strong skaters in good spots. The soft defense is already in our %, so trust the chance shown — this is a shortcut, not an extra edge." },
  // 2026-11-12 (user: one-tap buttons that show those players in the table, not another card): the tested lists, one each
  { key: "radar", label: "🔦 Under the radar", set: { find: ["radar"] }, title: "Lines he rarely clears that the model likes tonight — beats the players' own rates (graded nightly; Cheat Sheets has the record)." },
  { key: "multi", label: "🎯 Multi-point", set: { find: ["multi"] }, title: "2+ points beyond what he usually does (graded nightly)." },
  { key: "moving", label: "📈 Moving up", set: { find: ["moving"] }, title: "Ice time up 10%+ over his last 3 games — the strongest tested signal for points and assists. Already in the %; this shows who it lifts." },
  { key: "goalie", label: "🧤 Soft goalie", set: { find: ["goalie"] }, title: "Facing a starter clearly below average (goals saved above expected). Tested every season for points; already in the %." }];

// Collapsible filter panel for the long skater lists (lib/listFilters.js holds the shared state and the groups).
// 2026-10-25: the shared FilterPanel (tags, Top 3 / PRISM Picks, grade + H2H letter scales); base = the list before these
// filters (matchup / position / header team applied) so each pill shows how many skaters it would leave.
export default function ListFilters({ shown, total, base, ctx }) {
  const f = useListFilters();
  const pos = usePosition();
  // 2026-10-28 🔔 Alert me: saves this filter (+ position) as an alert, checked by components/SavedFilterAlerts.jsx
  return (
    <FilterPanel groups={withCounts(buildGroups(ctx), base)} value={f} shown={shown} total={total} noun="skaters" presets={LOCKED_IN}
      onChange={setListFilter} onClear={clearListFilters}
      onSave={(name) => saveFilter(`${name}${pos ? ` · ${pos}` : ""}`, { ...f, search: "" }, { pos, signal: ctx?.signal || "goal" })} />
  );
}
