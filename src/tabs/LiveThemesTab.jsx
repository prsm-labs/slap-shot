import { useEffect, useMemo, useState } from "react";
import { fetchGoalsLog } from "../lib/data.js";
import { openSkaterSlide } from "../slideouts.js";
import MatchupFilter from "../components/MatchupFilter.jsx";
import { useMatchup } from "../lib/matchupFilter.js";
import { easternToday, fetchLiveGoals, LIVE_POLL_MS } from "../lib/liveGoals.js";

// Goal Flurries — a team scoring 2+ goals within 3 minutes of game time (same gap-based
// clustering as Going Yard / Six Points' live themes). Built on the fly from the same goal rows
// as the Goal Tracker: the nightly log for past days, the live feed for tonight. Replaces the old
// one-off live_themes.json (last season only, undated, no matchups).
const FLURRY_GAP = 180; // seconds of game time between consecutive goals by the same team

function findFlurries(goals) {
  const byTeamGame = new Map();
  for (const g of goals) {
    const k = `${g.gameId}|${g.scorerTeam}`;
    if (!byTeamGame.has(k)) byTeamGame.set(k, []);
    byTeamGame.get(k).push(g);
  }
  const flurries = [];
  for (const list of byTeamGame.values()) {
    list.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    let run = [list[0]];
    const close = () => { if (run.length >= 2) flurries.push(run); };
    for (const g of list.slice(1)) {
      if (g.elapsedSeconds - run[run.length - 1].elapsedSeconds <= FLURRY_GAP) run.push(g);
      else { close(); run = [g]; }
    }
    close();
  }
  return flurries
    .map((goals) => ({
      team: goals[0].scorerTeam,
      opp: goals[0].oppTeam,
      matchup: goals[0].matchup,
      gameId: goals[0].gameId,
      date: goals[0].date,
      goals,
      span: goals[goals.length - 1].elapsedSeconds - goals[0].elapsedSeconds,
    }))
    .sort((a, b) => b.goals.length - a.goals.length || a.span - b.span);
}

function spanText(s) {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export default function LiveThemesTab() {
  const [all, setAll] = useState(null);
  const [meta, setMeta] = useState(null);
  const [live, setLive] = useState(null);
  const [picked, setPicked] = useState(null);
  const selected = useMatchup();
  const today = easternToday();

  useEffect(() => {
    fetchGoalsLog().then(({ goals, meta }) => {
      setAll(goals);
      setMeta(meta);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    async function load() {
      try {
        const result = await fetchLiveGoals(today);
        if (cancelled) return;
        setLive(result);
        timer = setTimeout(load, result.started && result.unfinished ? LIVE_POLL_MS : 5 * 60_000);
      } catch {
        if (cancelled) return;
        setLive((prev) => prev || { goals: [], hasGames: false, started: false, unfinished: false });
        timer = setTimeout(load, LIVE_POLL_MS);
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [today]);

  const liveToday = Boolean(live?.hasGames);
  const dates = useMemo(() => {
    if (!meta) return [];
    return liveToday && !meta.availableDates.includes(today) ? [...meta.availableDates, today] : meta.availableDates;
  }, [meta, liveToday, today]);
  const latest = dates[dates.length - 1];
  const date = picked ?? (meta && live ? latest : null);

  const dayGoals = useMemo(() => {
    if (!date) return [];
    if (date === today && liveToday) return live.goals;
    return all ? all.filter((g) => g.date === date) : [];
  }, [all, date, today, liveToday, live]);

  const dayGames = useMemo(
    () => [...new Set(dayGoals.map((g) => g.matchup))].sort().map((m) => ({ away: m.split("@")[0], home: m.split("@")[1] })),
    [dayGoals]
  );
  const gameFilter = selected && dayGoals.some((g) => g.matchup === selected) ? selected : null;
  const flurries = useMemo(
    () => findFlurries(gameFilter ? dayGoals.filter((g) => g.matchup === gameFilter) : dayGoals),
    [dayGoals, gameFilter]
  );

  // Season context: which teams string goals together most, from the full nightly log.
  const leaders = useMemo(() => {
    if (!all || !meta) return [];
    const current = meta.seasons?.[meta.seasons.length - 1];
    const season = Number(current?.slice(0, 4));
    const pool = all.filter((g) => g.season === season);
    const counts = {};
    for (const f of findFlurries(pool)) counts[f.team] = (counts[f.team] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [all, meta]);

  function step(delta) {
    const next = dates[dates.indexOf(date) + delta];
    if (next) setPicked(next);
  }

  if (!all || !meta || !date) {
    return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading goal flurries…</div>;
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">⚡ Goal Flurries</div>
        <div className="section-sub">A team scoring 2+ goals within 3 minutes — when games swing</div>
      </div>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => step(-1)} disabled={dates.indexOf(date) <= 0}>◀</button>
        <span className="mono" style={{ fontSize: 12 }}>
          {new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </span>
        <button className="btn" onClick={() => step(1)} disabled={dates.indexOf(date) >= dates.length - 1}>▶</button>
        <button className="btn" onClick={() => setPicked(latest)}>↩ Latest</button>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
          {date === today && liveToday ? `🔴 live goals${live.unfinished ? ` · refreshes every ${LIVE_POLL_MS / 1000}s` : ""} · ` : ""}
          {dayGoals.length} goals · {flurries.length} flurr{flurries.length === 1 ? "y" : "ies"}
        </span>
      </div>

      <div style={{ marginTop: 10 }}>
        <MatchupFilter games={dayGames} />
      </div>

      {flurries.length === 0 && (
        <div className="note">
          {dayGoals.length ? "No team scored twice within 3 minutes on this date" : "No goals on this date yet"}
          {gameFilter ? " in this matchup" : ""}.
        </div>
      )}

      {flurries.length > 0 && (
        <div className="grid-cards" style={{ marginBottom: 14 }}>
          {flurries.map((f, i) => (
            <div className="card" key={i} style={{ borderColor: f.goals.length >= 3 ? "var(--accent2)" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 17 }}>
                  {f.team} · {f.goals.length} goals in {spanText(f.span)}
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{f.matchup.replace("@", " @ ")}</span>
              </div>
              {f.goals.map((g, j) => (
                <div
                  key={j}
                  className="mono clickable"
                  style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)", cursor: "pointer" }}
                  onClick={() => openSkaterSlide({ playerId: g.scorerId, name: g.scorerName, team: g.scorerTeam })}
                >
                  <span style={{ color: "var(--muted)" }}>P{g.period} {g.timeInPeriod} </span>
                  <span className="player-name-link">{g.scorerName}</span>
                  <span style={{ color: "var(--muted)" }}> vs {g.goalieName}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {leaders.length > 0 && (
        <div className="card">
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>
            MOST FLURRIES THIS SEASON ({meta.seasons[meta.seasons.length - 1]}, through the last logged day)
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {leaders.map(([team, n]) => (
              <span key={team} className="mono" style={{ fontSize: 12 }}><b>{team}</b> {n}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
