import { setListFilter, useListFilters } from "../lib/listFilters.js";
import { setTeamFilter, useMatchup, useTeamFilter } from "../lib/matchupFilter.js";

// 2026-10-23 (user): the master team + player filter in the header, next to the date picker -- it replaces the per-page
// search boxes and team pickers. Team narrows every page to that team (a game picked in the strip still wins); the search
// matches skaters / goalies by name and teams by code, city or nickname (lib/teamSearch.js) on every list.
const TEAMS = ["ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD", "NSH",
  "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH"];

export default function MasterFilter() {
  const team = useTeamFilter();
  const sel = useMatchup();
  const f = useListFilters();
  const gamePicked = sel && !sel.startsWith("TEAM:");
  return (
    <div className="master-filter">
      <select value={team || ""} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Team" className={team ? "on" : ""}>
        <option value="">All teams</option>
        {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input type="search" className={f.search ? "on" : ""} value={f.search} onChange={(e) => setListFilter("search", e.target.value)}
        placeholder="Search a player or team (Matthews, TOR, Leafs)" aria-label="Search players and teams" />
      {(team || f.search) && <button className="date-back" onClick={() => { setTeamFilter(null); setListFilter("search", ""); }}>✕ Clear</button>}
      {team && gamePicked && <span className="date-hint">(the game picked below wins)</span>}
    </div>
  );
}
