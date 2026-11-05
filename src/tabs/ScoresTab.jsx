import { useEffect, useState, useSyncExternalStore } from "react";
import ViewPicker from "../components/ViewPicker.jsx";
import { liveFocus } from "../lib/nav.js";
import LiveTab from "./LiveTab.jsx";
import ScheduleTab from "./ScheduleTab.jsx";
import TonightSoFarTab from "./TonightSoFarTab.jsx";
import GoalTrackerTab from "./GoalTrackerTab.jsx";

// 📺 Scores (2026-11-05, user: merge Live and Schedule -- one place for this slate, past games and future games). Games = the old
// 🔴 Live page with a 7-day rail on top (any date: box scores, play-by-play, lineups before puck drop, Heating Up); Week list = the
// old 📅 Schedule; So far = 📡 Tonight so far (+ Goal Flurries); Goal Tracker = 🚨 Goal Tracker. A tapped schedule row / slideout
// matchup (lib/nav.js openGame) lands on Games with that game open; the goal ticker opens Goal Tracker.
const VIEWS = [["games", "🏒 Games"], ["week", "📅 Week list"], ["sofar", "📡 So far"], ["goals", "🚨 Goal Tracker"]];
const KEY = "slapshot.scores.view";
let want = null;
const subs = new Set();
export function showScoresView(v) { want = { v, at: Date.now() }; subs.forEach((f) => f()); }
const useWant = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => want, () => want);

export default function ScoresTab() {
  const [view, setRaw] = useState(() => { try { return want?.v || sessionStorage.getItem(KEY) || "games"; } catch { return "games"; } });
  const setView = (v) => { setRaw(v); try { sessionStorage.setItem(KEY, v); } catch { /* this visit only */ } };
  const focus = liveFocus.use();
  const asked = useWant();
  useEffect(() => { if (focus) setView("games"); }, [focus?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (asked) setView(asked.v); }, [asked?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div className="section-header">
        <div className="section-title">📺 Scores</div>
        <div className="section-sub">Tonight, past nights and the games ahead — tap a day, then a game for its box score (or lineups before puck drop)</div>
      </div>
      <ViewPicker options={VIEWS} value={view} onChange={setView} pillClass="pill-btn" rowClass="pill-row" label="Scores" />
      {view === "games" && <LiveTab embedded />}
      {view === "week" && <ScheduleTab embedded />}
      {view === "sofar" && <TonightSoFarTab />}
      {view === "goals" && <GoalTrackerTab />}
    </div>
  );
}
