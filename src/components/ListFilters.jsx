import FilterPanel, { withCounts } from "./FilterPanel.jsx";
import { buildGroups, clearListFilters, setListFilter, useListFilters } from "../lib/listFilters.js";

// Collapsible filter panel for the long skater lists (lib/listFilters.js holds the shared state and the groups).
// 2026-10-25: the shared FilterPanel (tags, Top 3 / PRISM Picks, grade + H2H letter scales); base = the list before these
// filters (matchup / position / header team applied) so each pill shows how many skaters it would leave.
export default function ListFilters({ shown, total, base, ctx }) {
  const f = useListFilters();
  return (
    <FilterPanel groups={withCounts(buildGroups(ctx), base)} value={f} shown={shown} total={total} noun="skaters"
      onChange={setListFilter} onClear={clearListFilters} />
  );
}
