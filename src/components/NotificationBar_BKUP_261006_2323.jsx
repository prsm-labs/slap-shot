import { useEffect, useRef, useState } from "react";
import { dismissAlert, markAlertsRead, pushAlert, setAlertPref, useAlerts } from "../lib/alerts.js";
import { fetchLiveGoals, easternToday } from "../lib/liveGoals.js";
import { useScoredPool } from "../lib/data.js";
import { usePicks } from "../lib/picks.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "./PlayerAvatar.jsx";

// Drop-down notification bar (like a phone banner) + the header bell. Mounted once in App.jsx, so the
// watchers run on every tab while the site is open:
//   goals   — /api/live every 20s while today's games are on (the feed itself is cached 15s, so a
//             goal shows up roughly 15-45s after it's scored)
//   lineups — the live slate pool (lib/data.js, lineup check every 3 min): a starting goalie
//             confirmed or changed, a team's official lineup posted (with scratches)
// Nothing fires for what was already true when the page opened. Banners swipe away (up or
// sideways), close with ✕, or hide after 8s.
const LIVE_MS = 20_000;
const IDLE_MS = 5 * 60_000;

function useGoalWatcher(enabled, picksRef, picksOnlyRef) {
  useEffect(() => {
    if (!enabled) return undefined;
    let seen = null; // goal keys already known
    let timer = null;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetchLiveGoals(easternToday());
        if (cancelled) return;
        const keys = res.goals.map((g) => `${g.gameId}|${g.period}|${g.timeInPeriod}|${g.scorerId}`);
        if (seen) {
          res.goals.forEach((g, i) => {
            if (seen.has(keys[i])) return;
            const mine = Boolean(picksRef.current[g.scorerId]);
            if (picksOnlyRef.current && !mine) return;
            pushAlert({
              kind: "goal",
              icon: "🚨",
              title: `GOAL — ${g.scorerName} (${g.scorerTeam})${mine ? " ⭐ your pick" : ""}`,
              body: `vs ${g.oppTeam} · P${g.period} ${g.timeInPeriod}${g.shotType ? ` · ${g.shotType.toLowerCase()}` : ""}${g.seasonGoalNum ? ` · goal #${g.seasonGoalNum}` : ""}${g.goalieName ? ` on ${g.goalieName}` : ""}`,
              player: { playerId: g.scorerId, name: g.scorerName, team: g.scorerTeam },
            });
          });
        }
        seen = new Set(keys);
        timer = setTimeout(poll, res.started && res.unfinished ? LIVE_MS : IDLE_MS);
      } catch {
        if (!cancelled) timer = setTimeout(poll, LIVE_MS);
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, picksRef, picksOnlyRef]);
}

function useLineupWatcher(enabled, pool) {
  const known = useRef(null); // { date, goalies: Map(team -> "id|status"), official: Set(team) }
  useEffect(() => {
    // Wait for the first lineup check, or every team already official would look "new".
    if (!pool?.meta?.slate || !pool.live?.lineupsLoaded) return;
    const date = pool.meta.slateDate;
    const goalies = new Map();
    for (const g of pool.meta.slate) {
      for (const side of ["away", "home"]) {
        goalies.set(g[side], { id: g[`${side}GoalieId`], name: g[`${side}Goalie`], status: g[`${side}GoalieStatus`], opp: side === "away" ? g.home : g.away });
      }
    }
    const official = new Set(pool.players.filter((p) => p.lineupStatus === "dressed").map((p) => p.team));
    const prev = known.current;
    known.current = { date, goalies, official };
    if (!enabled || !prev || prev.date !== date) return; // first look at this slate: just remember it

    for (const [team, g] of goalies) {
      const was = prev.goalies.get(team);
      if (!was || g.status === "In net") continue; // game start is covered by the goal feed
      if (was.id !== g.id && g.id != null) {
        pushAlert({ kind: "goalie", icon: "🔁", title: `Goalie change — ${team}`, body: `${g.name} (${g.status}) now expected vs ${g.opp}; was ${was.name || "unknown"}`, player: null });
      } else if (g.status === "Confirmed" && was.status !== "Confirmed") {
        pushAlert({ kind: "goalie", icon: "🥅", title: `Confirmed starter — ${team}`, body: `${g.name} starts vs ${g.opp}`, player: null });
      }
    }
    for (const team of official) {
      if (prev.official.has(team)) continue;
      const scratched = (pool.live?.removed || []).filter((r) => r.team === team && r.reason === "not dressed").map((r) => r.name);
      pushAlert({
        kind: "lineup", icon: "📋", title: `${team} lineup is official`,
        body: scratched.length ? `Scratched: ${scratched.slice(0, 6).join(", ")}${scratched.length > 6 ? ` +${scratched.length - 6}` : ""}` : "Everyone in the projections is dressed",
        player: null,
      });
    }
  }, [enabled, pool]);
}

function Banner({ a }) {
  const start = useRef(null);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const onStart = (e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; setDragging(true); };
  const onMove = (e) => {
    if (!start.current) return;
    const t = e.touches[0];
    setDx(t.clientX - start.current.x);
    setDy(Math.min(0, t.clientY - start.current.y));
  };
  const onEnd = () => {
    if (Math.abs(dx) > 70 || dy < -35) dismissAlert(a.id);
    start.current = null; setDx(0); setDy(0); setDragging(false);
  };
  const open = () => {
    if (a.player) openSkaterSlide(a.player);
    dismissAlert(a.id);
  };
  return (
    <div
      onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      style={{
        pointerEvents: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        background: "var(--surface2)", border: "1px solid var(--accent)", borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,.5)", transform: `translate(${dx}px, ${dy}px)`,
        opacity: 1 - Math.min(0.7, Math.abs(dx) / 200), transition: dragging ? "none" : "transform .2s, opacity .2s",
        animation: "ss-drop .25s ease-out", cursor: a.player ? "pointer" : "default",
      }}
    >
      {a.player ? <PlayerAvatar playerId={a.player.playerId} name={a.player.name} team={a.player.team} size={34} /> : <span style={{ fontSize: 24 }}>{a.icon}</span>}
      <div onClick={open} style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{a.player ? `${a.icon} ` : ""}{a.title}</div>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.body}</div>
      </div>
      <button className="btn" style={{ padding: "2px 8px" }} onClick={() => dismissAlert(a.id)} title="Dismiss">✕</button>
    </div>
  );
}

export function AlertBell() {
  const { prefs, history, unread } = useAlerts();
  const [open, setOpen] = useState(false);
  const toggle = () => { setOpen((v) => !v); markAlertsRead(); };
  const row = (key, label) => (
    <label key={key} className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", cursor: "pointer" }}>
      <input type="checkbox" checked={prefs[key]} onChange={(e) => setAlertPref(key, e.target.checked)} /> {label}
    </label>
  );
  return (
    <div style={{ position: "relative" }}>
      <button className="badge" onClick={toggle} title="Alerts" style={{ cursor: "pointer", background: "transparent" }}>
        🔔{unread ? <span style={{ marginLeft: 4, color: "var(--accent2)", fontWeight: 700 }}>{unread}</span> : null}
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 300, zIndex: 1500, maxHeight: 420, overflowY: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Alerts</div>
          {row("goals", "🚨 Goals as they're scored")}
          {row("lineups", "🥅 Confirmed goalies & official lineups")}
          {row("picksOnly", "⭐ Goals by my picks only")}
          <div className="mono" style={{ fontSize: 9, color: "var(--muted)", margin: "6px 0 8px" }}>
            Shows while Slap Shot is open (any tab). Goals arrive ~15-45s after they're scored.
          </div>
          {history.length === 0 && <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>No alerts yet.</div>}
          {history.map((a) => (
            <div key={a.id} className="mono" style={{ fontSize: 11, padding: "5px 0", borderTop: "1px solid rgba(255,255,255,.05)" }}>
              <span style={{ color: "var(--muted)" }}>{new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> {a.icon} {a.title}
              <div style={{ color: "var(--muted)", fontSize: 10 }}>{a.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NotificationBar() {
  const { prefs, visible } = useAlerts();
  const pool = useScoredPool({ includeStarted: true });
  const picks = usePicks();
  const picksRef = useRef(picks);
  const picksOnlyRef = useRef(prefs.picksOnly);
  useEffect(() => { picksRef.current = picks; picksOnlyRef.current = prefs.picksOnly; }, [picks, prefs.picksOnly]);
  useGoalWatcher(prefs.goals, picksRef, picksOnlyRef);
  useLineupWatcher(prefs.lineups, pool);

  if (!visible.length) return null;
  return (
    <div style={{ position: "fixed", top: 8, left: 0, right: 0, zIndex: 2000, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 10px", pointerEvents: "none" }}>
      <style>{"@keyframes ss-drop { from { transform: translateY(-120%); opacity: 0 } to { transform: none; opacity: 1 } }"}</style>
      <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((a) => <Banner key={a.id} a={a} />)}
      </div>
    </div>
  );
}
