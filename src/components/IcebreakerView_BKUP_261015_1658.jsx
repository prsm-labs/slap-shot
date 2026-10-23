import { useMemo, useState } from "react";
import { actualIcebreaker, icebreakerBoard, startGroups } from "../lib/icebreaker.js";
import { useTeamRatings } from "../lib/gameModel.js";
import { filterPositions, positionLabel } from "../lib/positionFilter.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "./PlayerAvatar.jsx";
import PickButton from "./PickButton.jsx";
import StarterTag from "./StarterTag.jsx";
import GamblyButton from "../components/GamblyButton.jsx";
import { betLine } from "../lib/gambly.js";
import IcebreakerPayoutChart from "./IcebreakerPayoutChart.jsx";
import { PAYOUT, promoGroup, promoRows, setPromoOverride, usePromo } from "../lib/iceBreakerPromo.js";

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
// Extra columns on DraftKings Ice Breaker promo nights (lib/iceBreakerPromo.js)
const PROMO_COLS = [
  ["payout", "Proj. bonus bets", "Projected Ice Breaker payout (bonus bets) if he breaks the ice — pool ÷ people who picked him; hover for the 80% range"],
  ["promoEv", "Promo EV", "Expected bonus bets = our Icebreaker % × projected payout"],
  ["marketP", "Market ice %", "DraftKings' view: first-goal price with the vig off × his game's share of the first goal"],
  ["fgBest", "1st goal odds", "Best first goal scorer price (the $5 qualifying bet)"],
  ["betEv", "$5 bet EV", "Expected profit of the $5 first goal bet itself at that price, with our First Goal %"],
];
const money = (v) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);
const am = (a) => (a == null ? "—" : a > 0 ? `+${a}` : String(a));
const TEAM_COLS = [
  ["p", "Icebreaker %", "Chance one of this team's skaters scores the fastest goal among these games"],
  ["fgP", "First goal %", "Chance this team scores its own game's first goal"],
  ["by5", "Goal by 5:00", "Chance this team scores in the first 5 minutes of its game"],
  ["by10", "Goal by 10:00", "Chance this team scores in the first 10 minutes of its game"],
  ["xg", "Team xG", "Expected goals tonight (game model)"],
];

// soft: show only skaters (and teams) facing a defense in tonight's softest third (display only)
export default function IcebreakerView({ players, slate, goals, position, soft = false, date }) {
  const ratings = useTeamRatings();
  const groups = useMemo(() => startGroups(slate), [slate]);
  const [startPick, setStartPick] = useState(null);
  const promo = usePromo(date);
  const pGroup = promoGroup(groups);
  const group = groups.find((g) => g.start === startPick) || (promo.on ? pGroup : null) || groups[0];
  const promoHere = promo.on && group && group === pGroup;
  const [pool, setPool] = useState(null); // viewer edits; null = the promo's / model default
  const [entrants, setEntrants] = useState(PAYOUT.entrants);
  const [xMode, setXMode] = useState("market");
  const [selectedId, setSelectedId] = useState(null);
  const opts = useMemo(() => ({ pool: pool ?? promo.pool ?? PAYOUT.pool, entrants }), [pool, promo.pool, entrants]);
  const board = useMemo(() => icebreakerBoard(players, group?.games, ratings), [players, group, ratings]);
  const allRows = useMemo(() => {
    const base = (board?.rows || []).map((r) => ({ ...r, p1SogPg: r.games_played && r.P1SOG != null ? r.P1SOG / r.games_played : null }));
    return promoHere ? promoRows(base, opts) : base;
  }, [board, promoHere, opts]);
  const rows = useMemo(() => filterPositions(allRows, position)
    .filter((r) => !soft || (r.oppSoftPct ?? 0) >= 0.67)
    .filter((r) => !selectedId || r.playerId === selectedId), [allRows, position, soft, selectedId]);
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, "iceP", "desc");
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState("players"); // "players" | "teams" | "graph" (promo nights)
  const softTeams = useMemo(() => new Set((players || []).filter((p) => (p.oppSoftPct ?? 0) >= 0.67).map((p) => p.team)), [players]);
  const teamSort = useSort((board?.teams || []).filter((t) => !soft || softTeams.has(t.team)), "p", "desc");
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

      <PromoBar promo={promo} date={date} group={pGroup} />

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

      <div className="pill-row" style={{ display: "inline-flex", marginBottom: 10 }}>
        <button className={`pill-btn ${mode === "players" ? "active" : ""}`} onClick={() => setMode("players")}>👤 Players</button>
        <button className={`pill-btn ${mode === "teams" ? "active" : ""}`} onClick={() => setMode("teams")}>🏒 Teams</button>
        {promoHere && <button className={`pill-btn ${mode === "graph" ? "active" : ""}`} onClick={() => setMode("graph")}>📈 Payout graph</button>}
      </div>
      {promo.on && !promoHere && (
        <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 8 }}>
          The Ice Breaker covers the {pGroup ? timeEt(pGroup.start) : "7 PM ET"} games — pick that start time for payouts and the graph.
        </div>
      )}
      {promoHere && mode === "graph" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }} className="mono">
            <div className="pill-row">
              <button className={`pill-btn ${xMode === "market" ? "active" : ""}`} onClick={() => setXMode("market")}>Across: DK odds</button>
              <button className={`pill-btn ${xMode === "model" ? "active" : ""}`} onClick={() => setXMode("model")}>Across: our model</button>
            </div>
            <label style={{ fontSize: 11 }}>Pool $
              <input type="number" value={opts.pool} min={10000} step={10000} onChange={(e) => setPool(Number(e.target.value) || null)}
                style={{ width: 90, marginLeft: 4, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }} />
            </label>
            <label style={{ fontSize: 11 }} title="People who used an Ice Breaker token tonight (DK doesn't publish it; ~27,000 on last season's 5-game nights)">Entrants
              <input type="number" value={entrants} min={1000} step={1000} onChange={(e) => setEntrants(Number(e.target.value) || PAYOUT.entrants)}
                style={{ width: 80, marginLeft: 4, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }} />
            </label>
          </div>
          <IcebreakerPayoutChart rows={allRows} selectedId={selectedId} onSelect={setSelectedId} opts={opts} xMode={xMode} />
          <PromoHistory history={promo.history} />
        </>
      )}
      {selectedId && (
        <div className="mono" style={{ fontSize: 11, marginBottom: 8 }}>
          Showing: <b>{allRows.find((r) => r.playerId === selectedId)?.name}</b>{" "}
          <button className="pill-btn" style={{ fontSize: 10 }} onClick={() => setSelectedId(null)}>✕ show all</button>
        </div>
      )}
      {soft && !rows.length && (
        <div className="mono" style={{ fontSize: 11, ...muted, marginBottom: 10 }}>
          No skater in this start-time group faces a soft defense tonight — pick another start time or turn off "Soft defense tonight".
        </div>
      )}

      {mode === "teams" ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className={teamSort.sortKey === "team" ? "sorted" : ""} onClick={() => teamSort.toggleSort("team")}>Team</th>
                <th>Game</th>
                {TEAM_COLS.map(([k, label, title]) => (
                  <th key={k} title={title} className={teamSort.sortKey === k ? "sorted" : ""} onClick={() => teamSort.toggleSort(k)}>
                    {label}{teamSort.sortKey === k ? (teamSort.sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
                <th>Fair odds</th>
                <th title="Most likely icebreaker on this team">Top skater</th>
                <th title="Official starting skaters (once posted)">▶ Starting</th>
              </tr>
            </thead>
            <tbody>
              {teamSort.sorted.map((t) => (
                <tr key={t.team}>
                  <td style={{ fontWeight: 700 }}>{actual?.scorerTeam === t.team ? "🧊 " : ""}{t.team}</td>
                  <td>{t.isHome ? `vs ${t.opp}` : `@ ${t.opp}`}</td>
                  <td style={{ fontWeight: 700 }}>{pct(t.p)}</td>
                  <td>{pct(t.fgP)}</td>
                  <td>{pct(t.by5, 0)}</td>
                  <td>{pct(t.by10, 0)}</td>
                  <td>{t.xg.toFixed(2)}</td>
                  <td>{fairOdds(t.p)}</td>
                  <td className="clickable" onClick={() => t.top && openSkaterSlide(t.top)}>
                    {t.top ? <span className="player-name-link">{t.top.name}</span> : "—"} {t.top ? <span className="mono" style={{ fontSize: 9, ...muted }}>{pct(t.top.iceP)}</span> : null}
                  </td>
                  <td className="mono" style={{ fontSize: 10, whiteSpace: "normal", minWidth: 160 }}>{t.starters ? t.starters.join(", ") : <span style={muted}>not posted</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (<>
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
              {promoHere && PROMO_COLS.map(([k, label, title]) => (
                <th key={k} title={title} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>{label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              ))}
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
                    <PickButton player={p} /> <GamblyButton text={betLine(p, "first")} />
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
                {promoHere && (
                  <>
                    <td style={{ fontWeight: 700 }} title={p.payout != null ? `80% range ${money(p.payLo)} – ${money(p.payHi)} · ~${(p.pickShare * 100).toFixed(2)}% of entrants on him` : ""}>{money(p.payout)}</td>
                    <td style={{ color: p.promoEv != null && p.promoEv >= 25 ? "#d4af37" : undefined }}>{money(p.promoEv)}</td>
                    <td>{p.marketP != null ? pct(p.marketP, 2) : "—"}</td>
                    <td title={p.fgBook || ""}>{am(p.fgBest)}{p.fgBook ? <span className="mono" style={{ fontSize: 9, ...muted }}> {p.fgBook}</span> : null}</td>
                    <td>{p.betEv != null ? `${p.betEv >= 0 ? "+" : "-"}$${Math.abs(p.betEv).toFixed(2)}` : "—"}</td>
                  </>
                )}
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
      </>)}
    </div>
  );
}

// Promo status line: confirmed by a DK Network post / likely (Thursday) / off, with a per-browser switch.
function PromoBar({ promo, date, group }) {
  if (!date) return null;
  const btn = (on, label) => (
    <button className="pill-btn" style={{ fontSize: 10, marginLeft: 6 }} onClick={() => setPromoOverride(date, on)}>{label}</button>
  );
  const pool = promo.pool ? `$${Math.round(promo.pool / 1000)}K` : "$250K";
  const games = group ? `${group.games.length} game${group.games.length > 1 ? "s" : ""} at ${timeEt(group.start)}` : "";
  if (promo.on) {
    const why = promo.override === true ? "switched on by you"
      : promo.status === "confirmed" ? <>confirmed by DraftKings (<a href={promo.source?.link} target="_blank" rel="noreferrer">DK Network</a>)</>
        : "likely — it's a Thursday, the promo's regular night; not confirmed by DraftKings yet";
    return (
      <div className="note" style={{ borderColor: "#d4af37" }}>
        🎟️ <b>DraftKings Ice Breaker tonight</b> — {pool} in bonus bets split by everyone who picked the quickest goal scorer ({games}).
        <span style={muted}> {why}.</span> Payout columns and the 📈 Payout graph are on.
        {btn(false, "Not running tonight")}
      </div>
    );
  }
  return (
    <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 8 }}>
      🎟️ No DraftKings Ice Breaker promo found for tonight{promo.override === false ? " (switched off by you)" : ""}.
      {btn(true, "It's on — show payouts")}
    </div>
  );
}

// Past payouts DraftKings quoted on DK Network (winners: bettors + bonus bets each; "could have": what a near miss would have paid).
function PromoHistory({ history }) {
  const [open, setOpen] = useState(false);
  if (!history?.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <button className="pill-btn" style={{ fontSize: 10 }} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide" : "Show"} past Ice Breaker payouts ({history.length})
      </button>
      {open && (
        <div className="table-wrap" style={{ marginTop: 6 }}>
          <table className="data-table">
            <thead><tr><th>Player</th><th>Bettors</th><th>Paid each</th><th>Type</th><th>Posted</th></tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td>{h.name}</td>
                  <td>{h.bettors ?? "—"}</td>
                  <td>{money(h.payout)}</td>
                  <td>{h.kind === "winner" ? "Winner" : "Would have paid"}</td>
                  <td>{h.post}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
