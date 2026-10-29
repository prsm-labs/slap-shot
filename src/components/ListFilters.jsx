import FilterPanel, { withCounts } from "./FilterPanel.jsx";
import { buildGroups, clearListFilters, setListFilter, useListFilters } from "../lib/listFilters.js";
import { saveFilter } from "../lib/savedFilters.js";
import { usePosition } from "../lib/positionFilter.js";

// Collapsible filter panel for the long skater lists (lib/listFilters.js holds the shared state and the groups).
// 2026-10-25: the shared FilterPanel (tags, Top 3 / PRISM Picks, grade + H2H letter scales); base = the list before these
// filters (matchup / position / header team applied) so each pill shows how many skaters it would leave.
export default function ListFilters({ shown, total, base, ctx }) {
  const f = useListFilters();
  const pos = usePosition();
  // 2026-10-28 🔔 Alert me: saves this filter (+ position) as an alert, checked by components/SavedFilterAlerts.jsx
  return (
    <FilterPanel groups={withCounts(buildGroups(ctx), base)} value={f} shown={shown} total={total} noun="skaters"
      onChange={setListFilter} onClear={clearListFilters}
      onSave={(name) => saveFilter(`${name}${pos ? ` · ${pos}` : ""}`, { ...f, search: "" }, { pos, signal: ctx?.signal || "goal" })} />
  );
}
