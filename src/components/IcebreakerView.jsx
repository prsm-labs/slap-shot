import { useMemo, useState } from "react";
import { actualIcebreaker, icebreakerBoard, startGroups } from "../lib/icebreaker.js";
import { useTeamRatings } from "../lib/gameModel.js";
import { filterPositions, positionLabel } from "../lib/positionFilter.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "./PlayerAvatar.jsx";
import PickButton from "./PickButton.jsx";
import StarterTag from "./StarterTag.jsx";

// First Goal page -> 🧊 Icebreaker: who scores the fastest goal (game clock) among the games that start
// together — the night's earliest start by default (lib/icebreaker.js has the model + backtest).
const pct = (p, d = 1) => (p == null ? "—" : `${(p * 100).toFixed(d)}%`);
const timeEt = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
const muted = { color: "var(--muted)" };
const big = { fontFamily: "'Oswald',sans-serif", fontWeight: 800 };
function fairOdds(p) {
  if (!(p > 0 && p < 1)) return "—";
  const a = p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  return a > 0 ? `+${a}` : String(a);
}
const COLS = [
  ["iceP", "Icebreaker %", "Chance he scores the fastest goal (game clock) among these games"],
  ["firstGoalP", "First goal %", "Chance he scores his own game's first goal (First Goal model)"],
  ["by10", "Goal by 10:00", "Chance he scores in the first 10 minutes of his game"],
  ["teamXg", "Team xG", "His team's expected goals tonight (game model)"],
  ["p1SogPg", "P1 SOG/GP", "1st-period shots on goal per game"],
];
const SHOW = 40;

export default function IcebreakerView({ players, slate, goals, position }) {
  const ratings = useTeamRatings();
  const groups = useMemo(() => startGroups(slate), [slate]);
  const [startPick, setStartPick] = useState(null);
  const group = groups.find((g) => g.start === startPick) || groups[0];
  const board = useMemo(() => icebreakerBoard(players, group?.games, ratings), [players, group, ratings]);
  const rows = useMemo(() => filterPositions((board?.rows || []).map((r) => ({
    ...r, p1SogPg: r.games_played && r.P1SOG != null ? r.P1SOG / r.games_played : null,
  })), position), [board, position]);
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, "iceP", "desc");
  const [showAll, setShowAll] = useState(false);
  const actual = actualIcebreaker(goals, group?.games);

  if (!ratings) return <div className="mono" style={{ ...muted, fontSize: 12 }}>Loading team ratings…</div>;
  if (!group) return <div className="note">No games on this slate.</div>;
  const actualRow = actual ? board?.rows.find((r) => r.playerId === actual.scorerId) : null;
  const allStarted = group.games.every((g) => g.state && g.state !== "FUT" && g.state !== "PRE");
  const fgTop = board ? [...board.rows].sort((a, b) => b.firstGoalP - a.firstGoalP)[0] : null;
  const top = board?.rows[0];

  return (
    <div>
      <div className="note">
        🧊 <b>Icebreaker</b> — the fastest goal by game clock among games that start together (tonight's earliest start by default).
        Every skater scores at his own rate (team expected goals × his share of the team's First Goal weight), so the favorite isn't
        always the top First Goal pick: a 10% shot in a low-scoring game can rank below an 8% shot in a shootout.
        Backtested over 528 nights: on nights with 2+ early games the top pick broke the ice 3.9% of the time (random skater ~0.5%),
        a top-10 pick 22%. Once the NHL posts the official starting lineups (shortly before puck drop), the skaters on the ice for the
        opening faceoff (▶ STARTING) get the first ~45 seconds — with real starters the top-10 hit rate rose to 28% in the backtest.
      </div>

      {groups.length > 1 && (
        <div className="pill-row" style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 12 }}>
          {groups.map((g) => (
            <button key={g.start} className={`pill-btn ${g === group ? "active" : ""}`} onClick={() => setStartPick(g.start)}>
              {timeEt(g.start)} · {g.games.length} game{g.games.length > 1 ? "s" : ""}
            </button>
          ))}
        </div>
      )}

      <div className="signal-board" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="card" style={{ padding: 10, minWidth: 170 }}>
          <div className="mono" style={{ fontSize: 9, ...muted }}>GAMES IN THIS BUCKET</div>
          <div style={{ ...big, fontSize: 16 }}>{group.games.map((g) => `${g.away}@${g.home}`).join(" · ")}</div>
          <div className="mono" style={{ fontSize: 9, ...muted }}>
            {timeEt(group.start)} puck drop · ▶ starting lineups {board.startersPosted ? `posted for ${board.startersPosted} of ${group.games.length}` : "not posted yet"}
          </div>
        </div>
        <div className="card" style={{ padding: 10, minWidth: 150 }}>
          <div className="mono" style={{ fontSize: 9, ...muted }}>TYPICAL WAIT FOR 1ST GOAL</div>
          <div style={{ ...big, fontSize: 22 }}>{board.medianMin.toFixed(1)} min</div>
          <div className="mono" style={{ fontSize: 9, ...muted }}>game clock (median)</div>
        </div>
        <div className="card" style={{ padding: 10, minWidth: 190 }}>
          <div className="mono" style={{ fontSize: 9, ...muted }}>A GOAL IN ONE OF THESE GAMES BY</div>
          <div style={{ ...big, fontSize: 16 }}>2:00 {pct(board.by[2], 0)} · 5:00 {pct(board.by[5], 0)} · 10:00 {pct(board.by[10], 0)}</div>
        </div>
        <div className="card" style={{ padding: 10, minWidth: 170 }}>
          <div className="mono" style={{ fontSize: 9, ...muted }}>TEAM MOST LIKELY TO BREAK IT</div>
          <div style={{ ...big, fontSize: 20 }}>{board.teams[0]?.team} {pct(board.teams[0]?.p, 0)}</div>
          <div className="mono" style={{ fontSize: 9, ...muted }}>{board.teams.slice(1, 4).map((t) => `${t.team} ${pct(t.p, 0)}`).join(" · ")}</div>
        </div>
        {top && (
          <div className="card" style={{ padding: 10, minWidth: 190, borderColor: "var(--accent)" }}>
            <div className="mono" style={{ fontSize: 9, ...muted }}>🧊 ICEBREAKER PICK</div>
            <div style={{ ...big, fontSize: 18 }}>{top.name} {pct(top.iceP)}</div>
            <div className="mono" style={{ fontSize: 9, ...muted }}>
              {top.team} · fair {fairOdds(top.iceP)}{fgTop && fgTop.playerId !== top.playerId ? ` · top First Goal % is ${fgTop.name}` : ""}
            </div>
          </div>
        )}
      </div>

      {actual && (
        <div className="note" style={{ borderColor: "var(--accent)" }}>
          🧊 {allStarted ? "Fastest goal so far" : "Fastest goal so far (not every game in this bucket has started)"}: <b>{actual.scorerName}</b> ({actual.scorerTeam})
          {" "}at {Math.floor(actual.elapsedSeconds / 60)}:{String(actual.elapsedSeconds % 60).padStart(2, "0")} of game time, {actual.matchup?.replace("@", " @ ")}
          {actualRow ? <span style={muted}> — our #{actualRow.iceRank} of {board.rows.length} ({pct(actualRow.iceP)})</span> : null}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className={sortKey === "name" ? "sorted" : ""} onClick={() => toggleSort("name")}>Skater{sortKey === "name" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              <th>Game</th>
              {COLS.map(([k, label, title]) => (
                <th key={k} title={title} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>{label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              ))}
              <th>Fair odds</th>
            </tr>
          </thead>
          <tbody>
            {(showAll ? sorted : sorted.slice(0, SHOW)).map((p) => (
              <tr key={p.playerId}>
                <td className="clickable" onClick={() => openSkaterSlide(p)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mono" style={{ fontSize: 10, ...muted, width: 22 }}>#{p.iceRank}</span>
                    <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={26} />
                    <span className="player-name-link">{p.name}</span>
                    <PickButton player={p} />
                    {actual?.scorerId === p.playerId && <span>🧊</span>}
                    {p.startingLineup && <StarterTag />}
                    <span className="mono" style={{ fontSize: 9, ...muted }}>{p.team} · {positionLabel(p.position)}</span>
                  </div>
                </td>
                <td>{p.game.away} @ {p.game.home}</td>
                <td style={{ fontWeight: 700 }}>{pct(p.iceP)}</td>
                <td>{pct(p.firstGoalP)}</td>
                <td>{pct(p.by10)}</td>
                <td>{p.teamXg.toFixed(2)}</td>
                <td>{p.p1SogPg != null ? p.p1SogPg.toFixed(2) : "—"}</td>
                <td>{fairOdds(p.iceP)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > SHOW && (
        <button className="btn" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show top ${SHOW}` : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}
