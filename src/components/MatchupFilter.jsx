import { useEffect, useLayoutEffect, useRef } from "react";
import { fetchScoredPool, useScoredPool } from "../lib/data.js";
import { keysOf, matchupKey, pickMatchup, setMatchup, useMatchup, useMultiPick } from "../lib/matchupFilter.js";

// Matchup picker — one side-scrolling strip of compact game cards that sticks under the header while
// the page scrolls, so the matchup can be changed from anywhere on the page. Defaults to today's slate
// (live pool: start time / LIVE / FINAL and each team's goalie, ✓ = confirmed or in net); pass `games`
// ([{ away, home, ... }]) to use another list, e.g. the Goal Tracker's selected date. `label` = small
// caption on the "All games" card.

const STATE_TAG = { LIVE: "LIVE", CRIT: "LIVE", FINAL: "FINAL", OFF: "FINAL" };
const CONFIRMED = new Set(["Confirmed", "In net"]);
const lastName = (n) => (n ? n.split(" ").slice(1).join(" ") || n : "—");
const timeOf = (utc) => (utc ? new Date(utc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

// Keep the strip just below the sticky header, whatever height the header wraps to.
function useHeaderHeight() {
  useLayoutEffect(() => {
    const header = document.querySelector(".header");
    if (!header) return undefined;
    const set = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
}

function GoalieLine({ name, status }) {
  return (
    <span>
      {lastName(name)}
      {CONFIRMED.has(status) && <span style={{ color: "var(--green)" }}> ✓</span>}
    </span>
  );
}

export default function MatchupFilter({ games, label }) {
  // 2026-10-22: tonight's slate now lives in the header (components/GameStrip.jsx, above the tabs); a page only gets its own
  // strip when it passes a different `games` list (e.g. the Goal Tracker on another date)
  if (!games) return null;
  return <MatchupStrip games={games} label={label} />;
}

function MatchupStrip({ games, label }) {
  const selected = useMatchup();
  const multi = useMultiPick();
  const live = useScoredPool({ includeStarted: true });
  const scroller = useRef(null);
  useHeaderHeight();

  useEffect(() => {
    if (!games) fetchScoredPool().catch(() => {});
  }, [games]);

  const list = games || live?.meta?.slate || [];
  const keys = list.map((g) => matchupKey(g.away, g.home));
  const picked = keysOf(selected); // 2026-10-25: one or several games
  const outside = picked.length && list.length && !picked.some((k) => keys.includes(k));

  // Bring the selected game into view inside the strip (horizontal only — never scrolls the page).
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector("[data-on='1']");
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: Math.max(0, left - 40), behavior: "smooth" });
    }
  }, [selected, list.length]);

  if (!list.length) return null;

  return (
    <div className="matchup-strip">
      <div className="matchup-strip-scroll" ref={scroller}>
        <button className={`matchup-chip all ${!selected ? "on" : ""}`} onClick={() => setMatchup(null)}>
          <span className="mc-teams">All games</span>
          <span className="mc-sub">{label || `${list.length} games`}</span>
        </button>
        {outside && (
          <button className="matchup-chip on" data-on="1" onClick={() => setMatchup(null)} title="Not on this list — click to clear">
            <span className="mc-teams">{picked.map((k) => k.replace("@", " @ ")).join(", ")} ✕</span>
            <span className="mc-sub">not on this date</span>
          </button>
        )}
        {list.map((g, i) => {
          const k = keys[i];
          const on = picked.includes(k);
          const tag = STATE_TAG[g.state];
          return (
            <button
              key={k}
              data-on={on ? "1" : undefined}
              className={`matchup-chip ${on ? "on" : ""} ${selected && !on ? "dim" : ""}`}
              onClick={(e) => pickMatchup(k, multi || e.ctrlKey || e.metaKey)}
              title={on ? "Click again to show all games" : `Show only ${g.away} @ ${g.home}`}
            >
              <span className="mc-teams">
                {g.away} @ {g.home}
                {(tag || g.startTimeUTC) && (
                  <span className="mc-time" style={tag === "LIVE" ? { color: "var(--green)" } : undefined}>{tag || timeOf(g.startTimeUTC)}</span>
                )}
              </span>
              {(g.awayGoalie || g.homeGoalie) && (
                <span className="mc-sub">
                  <GoalieLine name={g.awayGoalie} status={g.awayGoalieStatus} /> · <GoalieLine name={g.homeGoalie} status={g.homeGoalieStatus} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
