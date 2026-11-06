import FilterPanel, { withCounts } from "./FilterPanel.jsx";
import { buildGroups, clearListFilters, setListFilter, useListFilters } from "../lib/listFilters.js";
import { saveFilter } from "../lib/savedFilters.js";
import { usePosition } from "../lib/positionFilter.js";

// 2026-11-06 🔒 Locked in (user): effective grade A+ to C + one of the 10 softest defenses (xGA), one tap. Tested first (2023-26 held
// out, 16.6k skater-nights): 17.9% hit vs 16.6% said, nearly all from the soft defense; H2H added nothing, so it's left out.
const LOCKED_IN = [{ key: "locked", label: "🔒 Locked in", set: { grades: ["A+", "A", "B", "C"], oppd: ["soft"] },
  title: "Grade A+ to C facing one of the league's 10 softest defenses — the strong skaters in good spots. In 2023-26 tests they hit slightly more than their chance said (about 1 point, mostly from the soft defense)." }];

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
