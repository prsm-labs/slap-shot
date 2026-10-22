import { useEffect, useMemo, useState } from "react";
import { useSort } from "../lib/useSort.js";

// ⏱️ Fastest to concede (2026-10-22, user): which teams and goalies give up a goal soonest, this season and last.
// public/data/first_concede.json (nhl_project/build_first_concede.py, MoneyPuck shots, regular season). CONTEXT ONLY: early concedes
// barely repeat within a season (split-half r: goal in the first 5 min +0.03, first 10 min +0.26, conceding the game's first goal
// +0.13, vs total goals against +0.66; 2022-26), so it doesn't feed any chance on this page.
const mmss = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const pc = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const COLS = [
  ["gp", "GP", "Games (goalies: starts)"],
  ["gaPg", "GA/g", "Goals allowed per game (goalies: while in net)"],
  ["avgFirst", "Avg 1st GA", "Average game time of the first goal allowed, in games where one was allowed (lower = sooner)"],
  ["medFirst", "Median", "Median game time of the first goal allowed"],
  ["u5", "≤5 min", "Share of games allowing a goal in the first 5 minutes"],
  ["u10", "≤10 min", "Share of games allowing a goal in the first 10 minutes"],
  ["p1", "1st per.", "Share of games allowing a goal in the 1st period"],
  ["first", "Gave up 1st goal", "Share of games where they allowed the game's first goal"],
];

function flat(list, season) {
  return list.map((x) => ({ ...x, ...(x[season] || {}), lastAvg: x.last?.avgFirst ?? null })).filter((x) => x.gp);
}

function Table({ rows, label, goalie }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, "avgFirst", "asc");
  return (
    <div style={{ overflowX: "auto", marginBottom: 14 }}>
      <table className="data-table">
        <thead><tr>
          <th onClick={() => toggleSort(goalie ? "name" : "team")}>{label}</th>
          {COLS.map(([k, l, t]) => <th key={k} title={t} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>{l}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>)}
          <th title="Last season's average time of the first goal allowed" onClick={() => toggleSort("lastAvg")}>Last season</th>
        </tr></thead>
        <tbody>{sorted.map((r) => (
          <tr key={goalie ? r.goalieId : r.team}>
            <td className="mono" style={{ whiteSpace: "nowrap" }}>
              {goalie ? <><b>{r.name}</b> <span style={{ color: "var(--muted)" }}>{r.team}</span></> : <b>{r.team}</b>}
              {goalie && r.tonight && <span style={{ fontSize: 9, color: "var(--accent2)", marginLeft: 4 }} title={`Tonight vs ${r.tonight.vs} (${r.tonight.status || "projected"})`}>tonight vs {r.tonight.vs}</span>}
              {!goalie && r.tonight && <span style={{ fontSize: 9, color: "var(--accent2)", marginLeft: 4 }}>tonight</span>}
            </td>
            {COLS.map(([k]) => <td key={k} className="mono">{k === "avgFirst" || k === "medFirst" ? mmss(r[k]) : k === "gp" || k === "gaPg" ? r[k] : pc(r[k])}</td>)}
            <td className="mono" style={{ color: "var(--muted)" }}>{mmss(r.lastAvg)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function FirstConcedeView() {
  const [d, setD] = useState(null);
  const [season, setSeason] = useState("now");
  const [tonight, setTonight] = useState(true);
  const [minGp, setMinGp] = useState(3);
  useEffect(() => {
    fetch("/data/first_concede.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  }, []);
  const teams = useMemo(() => (d ? flat(d.teams, season).filter((x) => (!tonight || x.tonight) && x.gp >= minGp) : []), [d, season, tonight, minGp]);
  const goalies = useMemo(() => (d ? flat(d.goalies, season).filter((x) => (!tonight || x.tonight) && x.gp >= minGp) : []), [d, season, tonight, minGp]);
  if (!d) return <div className="note">Loading…</div>;
  const btn = (on, label, onClick) => <button className={`pill-btn ${on ? "active" : ""}`} onClick={onClick}>{label}</button>;
  return (
    <div>
      <div className="note">
        ⏱️ <b>Fastest to concede</b>: how soon each team and goalie gives up a goal — average and median game time of the first goal
        allowed, and how often it comes in the first 5 / 10 minutes or 1st period. Goalies count only goals allowed while they're in
        net, over games they started. <b>Context, not a prediction:</b> over 2022-26 these early-goal rates barely repeat from one half of
        a season to the other (first 5 minutes r +0.03, first 10 minutes +0.26, conceding first +0.13) — far less than total goals
        against (+0.66) — so they don't change any chance on this page.
      </div>
      <div className="pill-row" style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {btn(season === "now", `This season (${d.season}-${String(d.season + 1).slice(2)})`, () => setSeason("now"))}
        {btn(season === "last", "Last season", () => setSeason("last"))}
        {btn(tonight, "Tonight's teams / starters", () => setTonight((v) => !v))}
        {btn(minGp >= 3, `Min ${minGp >= 3 ? 3 : 1} GP`, () => setMinGp((v) => (v >= 3 ? 1 : 3)))}
      </div>
      <div className="section-title" style={{ fontSize: 16, margin: "6px 0" }}>Teams ({teams.length})</div>
      <Table rows={teams} label="Team" />
      <div className="section-title" style={{ fontSize: 16, margin: "6px 0" }}>Goalies ({goalies.length})</div>
      <Table rows={goalies} label="Goalie" goalie />
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>MoneyPuck shot data, regular season; updated {d.generated}.{tonight ? " Goalies shown are tonight's projected / confirmed starters." : ""}</div>
    </div>
  );
}
