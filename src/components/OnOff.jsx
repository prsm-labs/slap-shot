import { useEffect, useState } from "react";
import { skaterStatus } from "../lib/lineups.js";

// 2026-10-21 (user): 👥 with / without teammates on the skater slideout chart (CourtIQ's OnOff twin).
// public/data/onoff/<TEAM>.json (build_onoff.py): his games for this team over last season + this, and the games each
// teammate played. Tonight's injured teammates (RotoWire, via /api/lineups) are listed first. History only, not a projection.
const cache = {};
export function useOnOff(team) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!team) return undefined;
    let alive = true;
    if (!cache[team]) cache[team] = fetch(`/data/onoff/${team}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    cache[team].then((x) => alive && setD(x));
    return () => { alive = false; };
  }, [team]);
  return d;
}

export function onOffGames(d, playerId, sel, how) {
  const all = d?.players?.[String(playerId)] || [];
  if (!sel.length) return { match: null, rest: null, all };
  const sets = sel.map((id) => new Set(d.played[String(id)] || []));
  const ok = (g) => (how === "with" ? sets.every((s) => s.has(g.gameId)) : sets.every((s) => !s.has(g.gameId)));
  return { match: all.filter(ok), rest: all.filter((g) => !ok(g)), all };
}

const per = (gs, k) => (gs.length ? (gs.reduce((a, g) => a + g[k], 0) / gs.length) : null);
const f2 = (v) => (v == null ? "—" : v.toFixed(2));
const toi = (gs) => { const s = per(gs, "toi"); return s == null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`; };
const muted = { color: "var(--muted)", fontSize: 10 };

export function OnOffPicker({ d, player, maps, sel, setSel, how, setHow }) {
  const [open, setOpen] = useState(false);
  if (!d?.mates?.length) return null;
  const mates = d.mates.filter((m) => m.id !== player.playerId).map((m) => {
    const st = maps ? skaterStatus(maps, { playerId: m.id, team: d.team, name: m.name }) : null;
    return { ...m, out: st?.out || null };
  });
  const name = (id) => mates.find((m) => m.id === id)?.name || id;
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const { match, rest } = onOffGames(d, player.playerId, sel, how);
  const line = (gs) => `${f2(per(gs, "goals"))} G · ${f2(per(gs, "points"))} P · ${f2(per(gs, "sog"))} SOG · ${toi(gs)} TOI a game`;
  const btn = (on, label, onClick) => <button className={`pill-btn ${on ? "active" : ""}`} onClick={onClick}>{label}</button>;
  return (
    <div style={{ margin: "4px 0 6px" }}>
      <div className="pill-row" style={{ display: "inline-flex", flexWrap: "wrap" }}>
        {btn(sel.length > 0, `👥 With / without${sel.length ? ` (${sel.length})` : ""} ${open ? "▲" : "▼"}`, () => setOpen((v) => !v))}
        {sel.length > 0 && <>
          {btn(how === "without", "Without", () => setHow("without"))}
          {btn(how === "with", "With", () => setHow("with"))}
          {btn(false, "✕ Clear", () => setSel([]))}
        </>}
      </div>
      {open && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", margin: "4px 0", maxHeight: 220, overflowY: "auto" }}>
          {[[true, "🩹 Out / injured tonight (RotoWire)"], [false, "Teammates (most ice time first)"]].map(([inj, label]) => {
            const group = mates.filter((m) => Boolean(m.out) === inj);
            return group.length > 0 && (
              <div key={label}>
                <div className="mono" style={muted}>{label}</div>
                {group.map((m) => (
                  <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={sel.includes(m.id)} onChange={() => toggle(m.id)} />
                    {m.name}{m.out ? <span style={muted}> · {m.out}</span> : null}<span style={muted}> ({m.games} GP)</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {sel.length > 0 && (
        <div className="mono" style={{ ...muted, margin: "4px 0" }}>
          <b>{how === "with" ? "With" : "Without"} {sel.map(name).join(" + ")}</b>: {match.length} game{match.length === 1 ? "" : "s"}{match.length ? ` — ${line(match)}` : ""}. The other {rest.length}: {rest.length ? line(rest) : "—"}.
          {" "}His {d.team} games, {d.seasons.map((s) => `${s}-${String(s + 1).slice(2)}`).join(" + ")} regular season; the chart shows the last 10 that match. A teammate who joined mid-way counts as "without" before he arrived. History only.
        </div>
      )}
    </div>
  );
}
