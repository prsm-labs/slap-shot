import { useEffect, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { projectGoalie } from "../lib/crease.js";
import GradeBadge from "./GradeBadge.jsx";
import GoalieGameChart from "./GoalieGameChart.jsx";

// The goalie slideout body. Real NHL season lines (this season + last season as the historical
// snapshot) and recent games come from /api/player (api/player.js), so every goalie gets the same
// view no matter which page opened the slideout; tonight's start + Crease Lab projection and the
// shot-quality numbers come from the live slate pool.
const cache = new Map(); // playerId -> Promise

function fetchPlayer(id) {
  if (!cache.has(id)) {
    cache.set(id, fetch(`/api/player?id=${id}`).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || r.status);
      return body;
    }).catch((e) => {
      cache.delete(id);
      throw e;
    }));
  }
  return cache.get(id);
}

const sv = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));
const seasonLabel = (s) => `${String(s).slice(0, 4)}-${String(s).slice(6, 8)}`;

function Cell({ label, value }) {
  return (
    <div style={{ textAlign: "center", minWidth: 58 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 17 }}>{value ?? "—"}</div>
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

function SeasonCard({ title, s }) {
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {title} <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{seasonLabel(s.season)}{s.team ? ` · ${s.team}` : ""}</span>
      </div>
      {s.gp ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 6px", justifyContent: "space-between" }}>
          <Cell label={s.gs != null ? `GP (${s.gs} GS)` : "GP"} value={s.gp} />
          <Cell label="W-L-OTL" value={`${s.w}-${s.l}-${s.otl}`} />
          <Cell label="SV%" value={sv(s.svPct)} />
          <Cell label="GAA" value={s.gaa?.toFixed(2)} />
          <Cell label="SO" value={s.so} />
          <Cell label="Saves / SA" value={s.sa != null ? `${s.saves}/${s.sa}` : "—"} />
          <Cell label="GA" value={s.ga} />
          <Cell label="Saves / GP" value={s.saves != null ? (s.saves / s.gp).toFixed(1) : "—"} />
        </div>
      ) : (
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>No NHL games this season.</div>
      )}
    </div>
  );
}

function Tonight({ goalie, pool }) {
  const meta = pool?.meta;
  const game = (meta?.slate || []).find((g) => g.away === goalie.team || g.home === goalie.team);
  if (!game) return null;
  const side = game.away === goalie.team ? "away" : "home";
  const opp = side === "away" ? game.home : game.away;
  const starterId = game[`${side}GoalieId`];
  const time = new Date(game.startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const stats = pool.goalies.find((g) => g.playerId === goalie.playerId);
  const head = `Tonight: ${side === "away" ? "@" : "vs"} ${opp} · ${time}`;

  if (starterId !== goalie.playerId) {
    return (
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{head}</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Not the expected starter — {game[`${side}Goalie`] || "unknown"} ({game[`${side}GoalieStatus`] || "projected"}).
        </div>
      </div>
    );
  }
  const proj = projectGoalie(stats, goalie.team, opp, meta);
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {head} <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>· {game[`${side}GoalieStatus`] || "projected"} starter</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 6px", justifyContent: "space-between" }}>
        <Cell label="Proj saves" value={proj.saves} />
        <Cell label="Proj shots" value={proj.shots} />
        <Cell label="Proj GA" value={proj.goalsAllowed} />
        <Cell label="Proj SV%" value={sv(proj.savePct)} />
        {[20, 25, 30].map((n) => <Cell key={n} label={`${n}+ saves`} value={`${proj.lines[n]}%`} />)}
      </div>
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 6 }}>Crease Lab projection (backtested on 2025-26; see Scouting → Crease Lab).</div>
    </div>
  );
}

export default function GoalieProfile({ goalie }) {
  const pool = useScoredPool({ includeStarted: true });
  const [data, setData] = useState({ id: null, player: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchPlayer(goalie.playerId)
      .then((player) => !cancelled && setData({ id: goalie.playerId, player, error: null }))
      .catch((e) => !cancelled && setData({ id: goalie.playerId, player: null, error: String(e.message || e) }));
    return () => { cancelled = true; };
  }, [goalie.playerId]);

  const loaded = data.id === goalie.playerId;
  const player = loaded ? data.player : null;
  const stats = pool?.goalies.find((g) => g.playerId === goalie.playerId) || null;
  const team = player?.team || goalie.team;
  // If the NHL feed can't be reached, fall back to the pool's own recent games.
  const fallbackGames = (stats?.last7 || []).map((g) => ({
    gameId: g.gameId, season: Number(String(g.gameId).slice(0, 4)), date: g.date, opp: g.opp, home: g.home,
    decision: g.win ? "W" : null, started: true, sa: g.sogFaced, ga: g.goalsAllowed, saves: g.sogFaced - g.goalsAllowed, svPct: g.savePct,
  }));

  return (
    <div>
      {player && (
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: -2 }}>
          {player.number != null ? `#${player.number} · ` : ""}{player.catches ? `Catches ${player.catches}` : ""}
          {stats?.grade && <> · Grade <GradeBadge grade={stats.grade} /></>}
        </div>
      )}

      <Tonight goalie={{ ...goalie, team }} pool={pool} />

      {!loaded && <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>Loading NHL stats…</div>}
      {loaded && data.error && <div className="note" style={{ marginTop: 10 }}>Couldn't reach the NHL stats feed ({data.error}) — showing the app's own numbers.</div>}
      {player && <SeasonCard title="This season" s={player.seasons.current} />}
      {player && <SeasonCard title="Last season (historical)" s={player.seasons.previous} />}

      {stats && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Shot quality <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>MoneyPuck shot data, 2025-26 + 2026-27</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 6px", justifyContent: "space-between" }}>
            <Cell label="High-danger SV%" value={sv(stats.highDangerSavePct)} />
            <Cell label="GA / 60" value={stats.GA60_proxy} />
            <Cell label="Expected GA / 60" value={stats.xGA60_proxy} />
            <Cell label="Goals saved vs exp. / 60" value={stats.GA60_proxy != null && stats.xGA60_proxy != null ? (stats.xGA60_proxy - stats.GA60_proxy).toFixed(2) : "—"} />
          </div>
        </div>
      )}

      {loaded && <GoalieGameChart games={player ? player.games : fallbackGames} />}
    </div>
  );
}
