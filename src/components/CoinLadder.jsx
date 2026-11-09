import { useState } from "react";
import { STATS, SHORT, betKey, gameOf, isOpenPick, laddersOf, ticket, toggleSlip, useLineBoard, useSlip } from "../lib/coins.js";
import { useScoredPool } from "../lib/data.js";
import { tabRequest } from "../lib/nav.js";
import { closeAllSlides } from "../slideouts.js";
import Fold from "./Fold.jsx";
import "./Coins.css";

// 🪙 Degen Picks from the skater slideout (2026-11-09, user: pick from Scouting without crowding the lists). One folded line; open it
// for his priced lines (the Risk Slider's ladder) as chips -- tap to put a line on the shared slip, tap again to take it off.
export default function CoinLadder({ p: p0 }) {
  const pool = useScoredPool({ includeStarted: true });
  const board = useLineBoard();
  const slip = useSlip();
  const [stat, setStat] = useState("G");
  const m = pool?.meta;
  if (!p0 || !m || m.past || !board) return null;
  const p = pool.players.find((x) => x.playerId === p0.playerId) || p0;
  const lad = laddersOf(p, board);
  if (!Object.keys(lad).length) return null;
  const open = isOpenPick(gameOf(m, p.team)?.startTimeUTC);
  const mine = slip.filter((t) => t.playerId === p.playerId);
  const ladder = (lad[stat] || []).filter(([, ch]) => ch >= 0.02 && ch <= 0.97); // 2026-11-09: 3+ assists / 2+ goals are 2-18% lines
  const goSlip = () => { closeAllSlides(); tabRequest.set({ tab: "coins", at: Date.now() }); };
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <Fold more="Pick 🔻" less="Close 🔺" summary={<span>🪙 <b>Degen Picks</b> <span className="dp-muted dp-small">{!open ? "· his game has started" : mine.length ? `· ${mine.length} of his on your slip` : "· add his lines to your slip"}</span></span>}>
        {open ? <>
          <div className="cl-stats">{STATS.filter(([k]) => lad[k]).map(([k]) => <button key={k} type="button" className={`pill-btn ${stat === k ? "active" : ""}`} onClick={() => setStat(k)}>{SHORT[k]}</button>)}</div>
          <div className="cl-chips">
            {ladder.map(([T, ch]) => {
              const t = ticket(pool, p, stat, T, ch);
              const on = t && slip.some((x) => betKey(x) === betKey(t));
              return <button key={T} type="button" className={`cl-chip ${on ? "on" : ""}`} disabled={!t} onClick={() => toggleSlip(t)} title={on ? "On your slip: tap to remove" : "Add to your Degen Picks slip"}><b>{T}+</b><span>{Math.round(ch * 100)}%</span></button>;
            })}
            {!ladder.length && <span className="dp-muted dp-small">No priced lines for this stat.</span>}
          </div>
          <div className="dp-muted dp-small" style={{ marginTop: 6 }}>Our chance at each line (the Risk Slider's numbers). {slip.length > 0 && <button type="button" className="dp-link" onClick={goSlip}>Open your slip ({slip.length}) →</button>}</div>
        </> : <div className="dp-muted dp-small">Picks close at puck drop.</div>}
      </Fold>
    </div>
  );
}
