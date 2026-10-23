import { useEffect, useMemo, useState } from "react";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { useMatchup } from "../lib/matchupFilter.js";
import { FIRST_GOAL } from "../lib/goalBadges.js";

// 2026-27 Track Record — Going Yard style: every skater's saved pre-game projection (grade, Slap
// Score, tier, sim odds) next to their real box line. Data: public/data/track_record_2026.json,
// built each morning by build_track_record.py from public/data/projections/<date>.json snapshots
// (scripts/snapshot_projections.mjs) and the NHL's final box scores.
const TIERS = ["Elite Add-On", "Core Target", "Value Upside", "Ignore"];
const TIER_CLASS = { "Elite Add-On": "tier-elite", "Core Target": "tier-core", "Value Upside": "tier-value", Ignore: "tier-ignore" };
const SIM_BUCKETS = [[0, 10], [10, 20], [20, 30], [30, 101]];

const rate = (hits, n) => (n ? `${Math.round((hits / n) * 100)}%` : "—");
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function flatten(r) {
  const p = r.proj || {};
  const a = r.actual || {};
  return {
    ...r,
    played: Boolean(a.played),
    inPool: Boolean(r.proj),
    slapScore: p.slapScore ?? null,
    slapRank: p.slapRank ?? null,
    tier: p.tier ?? null,
    grade: p.effectiveGrade ?? null,
    simGoal: p.anytimeGoalPct ?? null,
    sim3Sog: p.plus3SogPct ?? null,
    firstGoalPct: p.firstGoalPct ?? null,
    goalSignal: Boolean(p.goalSignal),
    pointSignal: Boolean(p.pointSignal),
    g: a.g ?? null, ast: a.a ?? null, pts: a.p ?? null, sog: a.sog ?? null, toi: a.toi ?? null,
    toiSec: a.toi ? Number(a.toi.split(":")[0]) * 60 + Number(a.toi.split(":")[1]) : null,
    scored: (a.g || 0) > 0,
    firstGoal: Boolean(a.firstGoal),
  };
}

function StatCard({ label, value, sub }) {
  return (
    <div className="signal-tile">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function summarize(rows) {
  const graded = rows.filter((r) => r.inPool && r.played);
  const scorers = graded.filter((r) => r.scored);
  const tier = Object.fromEntries(TIERS.map((t) => {
    const set = graded.filter((r) => r.tier === t);
    return [t, { n: set.length, hits: set.filter((r) => r.scored).length }];
  }));
  const goalSig = graded.filter((r) => r.goalSignal);
  const pointSig = graded.filter((r) => r.pointSignal);
  const top10 = graded.filter((r) => r.slapRank <= 10);
  const expectedScorers = graded.reduce((s, r) => s + (r.simGoal || 0) / 100, 0);
  const expected3Sog = graded.reduce((s, r) => s + (r.sim3Sog || 0) / 100, 0);
  const actual3Sog = graded.filter((r) => r.sog >= 3).length;

  // First goal: where the model ranked each game's actual first scorer.
  const firstGoalRanks = rows.filter((r) => r.firstGoal).map((r) => {
    if (!r.inPool) return null;
    const game = rows.filter((x) => x.date === r.date && x.gameId === r.gameId && x.inPool);
    return 1 + game.filter((x) => x.firstGoalPct > r.firstGoalPct).length;
  });
  const ranked = firstGoalRanks.filter((x) => x != null);

  const buckets = SIM_BUCKETS.map(([lo, hi]) => {
    const set = graded.filter((r) => r.simGoal >= lo && r.simGoal < hi);
    const avg = set.length ? set.reduce((s, r) => s + r.simGoal, 0) / set.length : null;
    return { label: hi > 100 ? `${lo}%+` : `${lo}-${hi}%`, n: set.length, predicted: avg, actual: set.filter((r) => r.scored).length };
  });

  const upset = scorers.filter((r) => r.simGoal != null).sort((a, b) => a.simGoal - b.simGoal)[0];
  return {
    graded, scorers, tier, goalSig, pointSig, top10, expectedScorers, expected3Sog, actual3Sog,
    firstGoalRanks, ranked, buckets, upset, goals: graded.reduce((s, r) => s + (r.g || 0), 0),
  };
}

export default function TrackRecordLive() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(null); // null = whole season
  const [goalsOnly, setGoalsOnly] = useState(false);
  const [tierFilter, setTierFilter] = useState(null);
  const [showDnp, setShowDnp] = useState(false);
  const [search, setSearch] = useState("");
  const selected = useMatchup();
  const position = usePosition();

  useEffect(() => {
    fetch("/data/track_record_2026.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setData(d);
        setDate(d._meta.dates[d._meta.dates.length - 1] || null);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const all = useMemo(() => (data ? data.rows.map(flatten) : []), [data]);
  const dates = data?._meta.dates || [];
  const dayRows = useMemo(() => (date ? all.filter((r) => r.date === date) : all), [all, date]);
  const dayGames = useMemo(
    () => (date ? [...new Set(dayRows.map((r) => r.matchup))].sort().map((m) => ({ away: m.split("@")[0], home: m.split("@")[1] })) : []),
    [date, dayRows]
  );
  const gameFilter = date && selected && dayGames.some((g) => `${g.away}@${g.home}` === selected) ? selected : null;
  const scope = useMemo(
    () => filterPositions(gameFilter ? dayRows.filter((r) => r.matchup === gameFilter) : dayRows, position),
    [dayRows, gameFilter, position]
  );
  const s = useMemo(() => summarize(scope), [scope]);

  const tableRows = useMemo(() => {
    let rows = scope;
    if (!showDnp) rows = rows.filter((r) => r.played);
    if (goalsOnly) rows = rows.filter((r) => r.scored);
    if (tierFilter) rows = rows.filter((r) => r.tier === tierFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.team.toLowerCase() === q);
    }
    return rows;
  }, [scope, showDnp, goalsOnly, tierFilter, search]);
  const { sorted, sortKey, sortDir, toggleSort } = useSort(tableRows, "slapScore", "desc");

  if (error) {
    return <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Couldn't load the 2026-27 track record: {error}</div>;
  }
  if (!data) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading track record…</div>;
  if (!dates.length) return <div className="note">No graded days yet — the first day is graded the morning after its games.</div>;

  const idx = date ? dates.indexOf(date) : -1;
  const th = (k, label) => (
    <th className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>
      {label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setDate(dates[Math.max(idx - 1, 0)])} disabled={!date || idx <= 0}>◀</button>
        <span className="mono" style={{ fontSize: 12, minWidth: 120, textAlign: "center" }}>
          {date ? new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : `Season — ${dates.length} days`}
        </span>
        <button className="btn" onClick={() => setDate(dates[Math.min(idx + 1, dates.length - 1)])} disabled={!date || idx >= dates.length - 1}>▶</button>
        <button className={`pill-btn ${!date ? "active" : ""}`} onClick={() => setDate(date ? null : dates[dates.length - 1])}>
          {date ? "Whole season" : "Back to one day"}
        </button>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
          {s.graded.length} skaters graded · {s.scorers.length} scored · {s.goals} goals
          {data._meta.pending?.length ? ` · waiting on finals: ${data._meta.pending.map(shortDate).join(", ")}` : ""}
        </span>
      </div>

      <div className="note">
        ℹ️ Each skater's pre-game projection — saved before puck drop that day — next to their real box score.
        {dates.length < 15 ? ` Only ${dates.length} day${dates.length === 1 ? "" : "s"} graded so far: these rates will swing a lot until there are a few weeks of games.` : ""}
        {dates[0] === "2026-09-29" ? " Opening night (9/29) was rebuilt afterwards from data known before it, since snapshots started 9/30." : ""}
      </div>

      <PositionFilter />
      {date && <MatchupFilter games={dayGames} />}

      <div className="signal-board" style={{ flexWrap: "wrap" }}>
        <StatCard label="Scorers / expected" value={`${s.scorers.length} / ${s.expectedScorers.toFixed(1)}`} sub="actual vs sum of projected goal %" />
        {TIERS.map((t) => (
          <StatCard key={t} label={`${t} goal rate`} value={rate(s.tier[t].hits, s.tier[t].n)} sub={`${s.tier[t].hits}/${s.tier[t].n}`} />
        ))}
        <StatCard label="Top 10 Slap goal rate" value={rate(s.top10.filter((r) => r.scored).length, s.top10.length)} sub={`${s.top10.filter((r) => r.scored).length}/${s.top10.length}`} />
        <StatCard label="★ Goal Signal rate" value={rate(s.goalSig.filter((r) => r.scored).length, s.goalSig.length)} sub={`${s.goalSig.filter((r) => r.scored).length}/${s.goalSig.length}`} />
        <StatCard label="★ Point Signal rate" value={rate(s.pointSig.filter((r) => r.pts > 0).length, s.pointSig.length)} sub={`${s.pointSig.filter((r) => r.pts > 0).length}/${s.pointSig.length} got a point`} />
        <StatCard label="3+ SOG / expected" value={`${s.actual3Sog} / ${s.expected3Sog.toFixed(1)}`} sub="actual vs sum of sim %" />
        <StatCard
          label={`${FIRST_GOAL} First-goal pick rank`}
          value={s.ranked.length ? `#${(s.ranked.reduce((a, b) => a + b, 0) / s.ranked.length).toFixed(0)}` : "—"}
          sub={`avg rank of actual 1st scorer · top-5 ${s.ranked.filter((x) => x <= 5).length}/${s.firstGoalRanks.length}`}
        />
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="card" style={{ flex: "1 1 320px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>GOAL % CHECK — did skaters score as often as projected? (Through 10/4 this was the old shot sim, which ran low; from 10/5 Slap Score v2 — the grade model's matchup-adjusted goal %, with tiers by slate rank.)</div>
          <table className="data-table">
            <thead><tr><th>Sim goal %</th><th>Skaters</th><th>Sim said</th><th>Actually scored</th></tr></thead>
            <tbody>
              {s.buckets.map((b) => (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td>{b.n}</td>
                  <td>{b.predicted != null ? `${b.predicted.toFixed(1)}%` : "—"}</td>
                  <td>{b.n ? `${((b.actual / b.n) * 100).toFixed(1)}% (${b.actual})` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ flex: "1 1 320px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>🚨 WHO SCORED — and what we said before the game</div>
          {s.upset && (
            <div className="mono" style={{ fontSize: 11, marginBottom: 6, color: "var(--accent2)" }}>
              Biggest upset: {s.upset.name} ({s.upset.team}) — projected {s.upset.simGoal}%, Slap #{s.upset.slapRank}
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {[...scope.filter((r) => r.scored)].sort((a, b) => b.g - a.g || (b.simGoal ?? -1) - (a.simGoal ?? -1)).map((r) => (
              <div key={`${r.date}-${r.playerId}`} className="mono" style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                {"🚨".repeat(Math.min(r.g, 3))}{r.firstGoal ? ` ${FIRST_GOAL}` : ""} <b>{r.name}</b> <span style={{ color: "var(--muted)" }}>{r.team}{!date ? ` · ${shortDate(r.date)}` : ""}</span>
                <span style={{ color: "var(--muted)" }}>
                  {" "}— {r.inPool ? `Slap ${r.slapScore} (#${r.slapRank}) · ${r.tier} · goal ${r.simGoal}%` : "not in the projections (no NHL history)"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="pill-row">
          <button className={`pill-btn ${goalsOnly ? "active" : ""}`} onClick={() => setGoalsOnly((v) => !v)}>🚨 Goals only</button>
          <button className={`pill-btn ${showDnp ? "active" : ""}`} onClick={() => setShowDnp((v) => !v)}>Show scratches</button>
        </div>
        <div className="pill-row">
          <button className={`pill-btn ${!tierFilter ? "active" : ""}`} onClick={() => setTierFilter(null)}>All tiers</button>
          {TIERS.map((t) => (
            <button key={t} className={`pill-btn ${tierFilter === t ? "active" : ""}`} onClick={() => setTierFilter(tierFilter === t ? null : t)}>{t}</button>
          ))}
        </div>
        <input
          className="mono"
          placeholder="Search skater or team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 9px", fontSize: 12, flex: 1, minWidth: 160 }}
        />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {!date && th("date", "Date")}
              {th("name", "Skater")}
              <th>Pre-game goalie</th>
              {th("grade", "Grade")}
              {th("slapScore", "Slap")}
              {th("tier", "Tier")}
              {th("simGoal", "Goal %")}
              {th("sim3Sog", "Sim 3+SOG")}
              {th("firstGoalPct", `${FIRST_GOAL}%`)}
              {th("g", "G")}
              {th("ast", "A")}
              {th("pts", "P")}
              {th("sog", "SOG")}
              {th("toiSec", "TOI")}
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={`${r.date}-${r.gameId}-${r.playerId}`} className={r.scored ? "signal-row" : ""}>
                {!date && <td className="mono">{shortDate(r.date)}</td>}
                <td className="clickable" onClick={() => openSkaterSlide({ playerId: r.playerId, name: r.name, team: r.team })}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PlayerAvatar playerId={r.playerId} name={r.name} team={r.team} size={26} />
                    <div>
                      <span className="player-name-link">{r.name}</span>
                      {(r.goalSignal || r.pointSignal) && <span className="signal-star" title={r.goalSignal ? "Goal Signal" : "Point Signal"}> ★</span>}
                      {r.firstGoal && <span title="First goal of the game"> {FIRST_GOAL}</span>}
                      <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{r.team} vs {r.opp} · {positionLabel(r.position)}</div>
                    </div>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 11 }}>
                  {r.proj?.opponentGoalie || "—"} {r.proj?.goalieGrade && <GradeBadge grade={{ letter: r.proj.goalieGrade }} />}
                  {r.actualGoalie && r.proj?.opponentGoalie && !r.proj.opponentGoalie.endsWith(r.actualGoalie.split(". ").pop()) && (
                    <div style={{ fontSize: 9, color: "var(--red)" }}>actual: {r.actualGoalie}</div>
                  )}
                </td>
                <td>{r.grade ? <GradeBadge grade={{ letter: r.grade }} /> : "—"}</td>
                <td>{r.slapScore ?? "—"}{r.slapRank ? <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}> #{r.slapRank}</span> : ""}</td>
                <td>{r.tier ? <span className={`tier-pill ${TIER_CLASS[r.tier]}`}>{r.tier}</span> : <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>not projected</span>}</td>
                <td>{r.simGoal != null ? `${r.simGoal}%` : "—"}</td>
                <td>{r.sim3Sog != null ? `${r.sim3Sog}%` : "—"}</td>
                <td>{r.firstGoalPct != null ? `${r.firstGoalPct}%` : "—"}</td>
                <td style={{ fontWeight: r.g ? 800 : 400 }}>{r.played ? r.g : "—"}</td>
                <td>{r.played ? r.ast : "—"}</td>
                <td>{r.played ? r.pts : "—"}</td>
                <td>{r.played ? r.sog : "—"}</td>
                <td className="mono">{r.played ? r.toi : "—"}</td>
                <td>{!r.played ? <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>DNP</span> : r.scored ? "🚨 Goal" : r.pts ? "🍎 Point" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && <div className="mono" style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>No skaters match this filter.</div>}
    </div>
  );
}
