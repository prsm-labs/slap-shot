import { useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { clearPicks, PICK_TYPE, PICK_TYPES, removePick, setPick, usePicks } from "../lib/picks.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";

// My Picks — every skater picked with a [+] button (lib/picks.js, saved in this browser), grouped by
// category, with tonight's matchup from the live slate pool and a CSV export.
const gameTime = (utc) => (utc ? new Date(utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "");

function downloadCsv(rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-picks.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function MyPicksTab() {
  const picks = usePicks();
  const pool = useScoredPool({ includeStarted: true });
  const [confirmClear, setConfirmClear] = useState(false);

  const byId = useMemo(() => new Map((pool?.players || []).map((p) => [p.playerId, p])), [pool]);
  const slateByTeam = useMemo(() => {
    const m = new Map();
    for (const g of pool?.meta?.slate || []) { m.set(g.away, g); m.set(g.home, g); }
    return m;
  }, [pool]);
  const list = Object.values(picks).sort((a, b) => a.ts.localeCompare(b.ts));

  function exportCsv() {
    const rows = [["Category", "Player", "Team", "Position", "Opponent", "Home/Away", "Game time (ET)", "Opp goalie", "Grade", "Model goal %", "Slap Score", "Picked at"]];
    for (const pk of list) {
      const p = byId.get(pk.pid);
      const g = slateByTeam.get(pk.team);
      rows.push([
        PICK_TYPE[pk.type]?.label || pk.type, pk.name, pk.team, p?.position || "",
        p?.opponentTeam || "", p ? (p.isHome ? "Home" : "Away") : "", g ? gameTime(g.startTimeUTC) : "",
        p?.opponentGoalie || "", p?.effectiveGrade?.letter || "",
        p?.modelProbs ? Math.round(p.modelProbs.goal * 1000) / 10 : "", p?.slapScore ?? "", pk.ts,
      ]);
    }
    downloadCsv(rows);
  }

  function clearAll() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    clearPicks();
    setConfirmClear(false);
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">⭐ My Picks</div>
        <div className="section-sub">Skaters you've tagged with the ＋ button — saved in this browser, with tonight's matchup</div>
      </div>

      {list.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={exportCsv}>⬇ Export CSV</button>
          <button className="btn" onClick={clearAll} style={confirmClear ? { borderColor: "var(--red)", color: "var(--red)" } : undefined}>
            {confirmClear ? `Click again to clear all ${list.length}` : "Clear"}
          </button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Categories</div>
        <div className="mono" style={{ fontSize: 11, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 4 }}>
          {PICK_TYPES.map((t) => <span key={t.key}>{t.emoji} {t.label}</span>)}
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
          One category per skater — picking another replaces it, picking the same one again removes it.
        </div>
      </div>

      {list.length === 0 && (
        <div className="note">
          No picks yet. Click the ＋ button next to any skater on Cheat Sheets, Top 3 Tonight, Scouting (All Matchups, Lamp Lab, Apple Lab),
          First Goal or Splits.
        </div>
      )}

      {PICK_TYPES.map((t) => {
        const rows = list.filter((pk) => pk.type === t.key);
        if (!rows.length) return null;
        return (
          <div key={t.key} className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{t.emoji} {t.label} <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>({rows.length})</span></div>
            {rows.map((pk) => {
              const p = byId.get(pk.pid);
              const g = slateByTeam.get(pk.team);
              return (
                <div key={pk.pid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.05)", flexWrap: "wrap" }}>
                  <div className="clickable" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, minWidth: 200 }}
                    onClick={() => openSkaterSlide(p || { playerId: pk.pid, name: pk.name, team: pk.team })}>
                    <PlayerAvatar playerId={pk.pid} name={pk.name} team={pk.team} size={30} />
                    <div>
                      <span className="player-name-link">{pk.name}</span>
                      {p?.lineupStatus === "dressed" && <span title="In tonight's official lineup"> ✅</span>}
                      {p?.effectiveGrade && <> <GradeBadge grade={p.effectiveGrade} /></>}
                      <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                        {p ? `${pk.team} ${p.isHome ? "vs" : "@"} ${p.opponentTeam} · ${p.opponentGoalie || "goalie TBD"}${g ? ` · ${gameTime(g.startTimeUTC)}` : ""}` : `${pk.team} · not on tonight's slate`}
                      </div>
                    </div>
                  </div>
                  <select
                    value={pk.type}
                    onChange={(e) => setPick(pk.pid, pk.name, pk.team, e.target.value)}
                    className="mono"
                    style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", fontSize: 11 }}
                  >
                    {PICK_TYPES.map((o) => <option key={o.key} value={o.key}>{o.emoji} {o.label}</option>)}
                  </select>
                  <button className="btn" title="Remove" onClick={() => removePick(pk.pid)}>✕</button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
