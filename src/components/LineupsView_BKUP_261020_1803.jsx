import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useLineups, startingGoalie, lineupMaps } from "../lib/lineups.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import { useMatchup, toggleMatchup } from "../lib/matchupFilter.js";

// Lineups view inside the Live tab (same idea as Going Yard's lineup cards): for each game,
// each team's starting goalie and status, power-play units, injuries, and — once the NHL posts
// it around warmups — the official dressed lineup.
const POS_ORDER = { C: 0, L: 1, R: 2, D: 3, G: 4 };

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  );
}

function Name({ p, team, poolById }) {
  const known = p.playerId && poolById.get(p.playerId);
  return (
    <span
      className={p.playerId ? "player-name-link clickable" : ""}
      style={{ cursor: p.playerId ? "pointer" : "default" }}
      onClick={() => p.playerId && (p.pos === "G" ? openGoalieSlide({ playerId: p.playerId, name: p.name, team }) : openSkaterSlide(known || { playerId: p.playerId, name: p.name, team }))}
    >
      {p.name}
    </span>
  );
}

function TeamColumn({ team, t, game, slateGame, maps, poolById }) {
  const goalie = startingGoalie(team, slateGame, maps);
  const dressed = [...t.dressed].sort((a, b) => (POS_ORDER[a.pos] ?? 9) - (POS_ORDER[b.pos] ?? 9));
  return (
    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 16 }}>{team}</div>
      <Section title="STARTING GOALIE">
        {goalie ? (
          <div className="mono" style={{ fontSize: 12 }}>
            <Name p={{ ...goalie, pos: "G" }} team={team} poolById={poolById} />{" "}
            {goalie.confirmed ? <span title={`Confirmed (${goalie.source})`}>✅ Confirmed</span>
              : <span style={{ color: "var(--muted)", fontSize: 10 }}>{goalie.status || "Projected"} · {goalie.source}</span>}
          </div>
        ) : <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>No report yet</div>}
      </Section>
      {[["POWER PLAY #1", t.pp1], ["POWER PLAY #2", t.pp2]].map(([label, list]) => list.length > 0 && (
        <Section key={label} title={label}>
          {list.map((p) => (
            <div key={p.name} className="mono" style={{ fontSize: 11 }}>
              <span style={{ color: "var(--muted)", display: "inline-block", width: 22 }}>{p.pos}</span>
              <Name p={p} team={team} poolById={poolById} />
            </div>
          ))}
        </Section>
      ))}
      {t.injuries.length > 0 && (
        <Section title="OUT / INJURED">
          {t.injuries.map((p) => (
            <div key={p.name} className="mono" style={{ fontSize: 11 }}>
              <span style={{ color: "var(--red)", fontWeight: 700, display: "inline-block", width: 44 }}>{p.tag || "OUT"}</span>
              {p.name} <span style={{ color: "var(--muted)" }}>{p.pos}</span>
            </div>
          ))}
        </Section>
      )}
      <Section title={game.officialLineup ? "✅ OFFICIAL LINEUP" : "OFFICIAL LINEUP"}>
        {dressed.length ? (
          <div className="mono" style={{ fontSize: 11, columns: 2 }}>
            {dressed.map((p) => (
              <div key={p.playerId}>
                <span style={{ color: "var(--muted)", display: "inline-block", width: 18 }}>{p.pos}</span>
                <Name p={p} team={team} poolById={poolById} />
              </div>
            ))}
          </div>
        ) : <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Posted by the NHL around warmups</div>}
      </Section>
    </div>
  );
}

export default function LineupsView({ date }) {
  const data = useLineups(date);
  const [pool, setPool] = useState({ byId: new Map(), slate: [] });
  const selected = useMatchup();

  useEffect(() => {
    fetchScoredPool().then(({ players, meta }) => setPool({ byId: new Map(players.map((p) => [p.playerId, p])), slate: meta?.slate || [] }));
  }, []);

  if (!data) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading lineups…</div>;
  if (!data.games.length) return <div className="note">No NHL games on this date.</div>;
  const maps = lineupMaps(data);
  const games = selected ? data.games.filter((g) => g.key === selected) : data.games;

  return (
    <div>
      <div className="note">
        ℹ️ Goalie status, power-play units and injuries from RotoWire (refreshed every few minutes); the official
        dressed lineup comes from the NHL once it's posted. Updated {new Date(data.generated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
        {data.rotowireError ? ` RotoWire unavailable right now (${data.rotowireError}).` : ""}
      </div>
      {(games.length ? games : data.games).map((g) => {
        const slateGame = pool.slate.find((s) => s.gameId === g.gameId);
        return (
          <div className="card" key={g.gameId} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span
                className="clickable"
                style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 18, cursor: "pointer" }}
                onClick={() => toggleMatchup(g.key)}
              >
                {g.away} @ {g.home}
              </span>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                {new Date(g.startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                {g.officialLineup ? " · ✅ lineups official" : " · lineups not yet official"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[g.away, g.home].map((team) => (
                <TeamColumn key={team} team={team} t={g.teams[team]} game={g} slateGame={slateGame} maps={maps} poolById={pool.byId} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
