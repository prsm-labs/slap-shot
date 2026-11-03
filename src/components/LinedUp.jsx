import { EDGES, STREAK, edgeKeys } from "../lib/edges.js";
import { useScoredPool } from "../lib/data.js";
import { setListFilter } from "../lib/listFilters.js";
import { tabRequest } from "../lib/nav.js";
import { closeAllSlides } from "../slideouts.js";

// 2026-11-03 (user: write the narrative -- "look out for this player tonight" -- and one tap for every player who looks like
// this; CourtIQ's twin). Only the tested edges (lib/edges.js) speak, each with its held-out number; nothing changes a chance.
// The depth-skater convergence test (CourtIQ's bench idea) found nothing past the live role term, so no new edge here.
export default function LinedUp({ p: p1 }) {
  const pool = useScoredPool({ includeStarted: true });
  const p = pool?.players?.find((x) => x.playerId === p1.playerId) || p1;
  const keys = edgeKeys(p, pool?.meta);
  const sc = p.streakCheck;
  if (!keys.length && !sc) return null;
  const likeThis = (k) => {
    setListFilter("edge", Array.isArray(k) ? k : [k]);
    setListFilter("edgeNot", []);
    setListFilter("edgeMode", "all");
    tabRequest.set({ tab: "board", at: Date.now() });
    closeAllSlides();
  };
  return (
    <div className="lined-up">
      <div className="section-title" style={{ fontSize: 15 }}>🔗 Lined up tonight</div>
      {keys.map((k) => {
        const e = EDGES.find((x) => x.v === k);
        if (!e) return null;
        const avoid = ["roaddog", "altb2b"].includes(k);
        return (
          <div key={k} className="lu-row">
            <div className="lu-head"><b>{e.label}</b><span className={`lu-kind ${avoid ? "avoid" : "boost"}`}>{avoid ? "runs under our chance" : "runs over our chance"}</span></div>
            <div className="section-sub">{e.title.replace(/ — tap twice to hide them$/, "")}</div>
            <button className="pill-btn lu-btn" onClick={() => likeThis(k)}>🔎 Show players like this</button>
          </div>
        );
      })}
      {sc && (
        <div className="lu-row">
          <div className="lu-head"><b>{STREAK.label}</b><span className="lu-kind caution">caution · a lean</span></div>
          <div className="section-sub">{sc.l5} points in his last 5 (usual {(sc.ppg * 5).toFixed(1)}) into {p.opponentTeam}, {sc.rank} of {sc.n} by expected goals allowed (1 = softest). Hot runs into defenses like this came in ~2 pts under our point chance in 3 of 4 seasons (2022-26) — his chance already counts the run.</div>
          <button className="pill-btn lu-btn" onClick={() => { setListFilter("tags", ["streak"]); setListFilter("tagsNot", []); tabRequest.set({ tab: "board", at: Date.now() }); closeAllSlides(); }}>🔎 Show players like this</button>
        </div>
      )}
      {keys.length > 1 && <button className="pill-btn lu-btn" onClick={() => likeThis(keys)}>🔎 Players with all {keys.length} of these</button>}
      <div className="section-sub">Context only — his chances already count tonight's matchup and his recent form.{keys.length ? " The edges above beat (or missed) those chances in every season tested." : ""}</div>
    </div>
  );
}
