import { Component, useEffect, useState } from "react";
import { setViewDate, useViewDate } from "../lib/data.js";
import { setMatchup } from "../lib/matchupFilter.js";
import { easternToday } from "../lib/liveGoals.js";

// 📅 Night picker (2026-10-23, user: the season is long -- one date pick at the top instead of ever-growing "past nights"
// lists). Sits above the game strip. A past night swaps every page to that night's pre-game snapshot
// (public/data/projections/<date>.json, frozen before puck drop) with each skater's real box line; PRISM Picks, Top 3,
// Cheat Sheets, Live and the Goal Tracker show that night. Nights = the snapshot index (projections/index.json).
const label = (d, opts = { weekday: "short", month: "short", day: "numeric" }) => new Date(`${d}T12:00:00`).toLocaleDateString([], opts);

export default function DateBar() {
  const date = useViewDate();
  const [dates, setDates] = useState([]);
  const today = easternToday();
  useEffect(() => {
    fetch("/data/projections/index.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => setDates((d?.dates || []).filter((x) => x < today).sort().reverse())).catch(() => {});
  }, [today]);
  const pick = (v) => { setMatchup(null); setViewDate(v || null); try { window.scrollTo({ top: 0 }); } catch { /* ignore */ } };
  if (!dates.length && !date) return null;
  return (
    <div className={`date-bar ${date ? "past" : ""}`}>
      <label className="date-pick">
        <span aria-hidden="true">📅</span>
        <select value={date || ""} onChange={(e) => pick(e.target.value)} aria-label="Pick a night">
          <option value="">Tonight · {label(today)}</option>
          {dates.map((d) => <option key={d} value={d}>{label(d)}</option>)}
        </select>
      </label>
      {date ? (
        <span className="date-note">
          Viewing <b>{label(date, { weekday: "long", month: "short", day: "numeric" })}</b> — the slate as it was frozen before puck drop, with how it played out.
          <button className="date-back" onClick={() => pick(null)}>Back to tonight ✕</button>
        </span>
      ) : <span className="date-hint">Pick a past night to see its slate, picks and results</span>}
    </div>
  );
}

// A page that can't draw a past night (it needs inputs the snapshot doesn't keep) says so instead of breaking the app.
export class PastNightGuard extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.warn("[PastNightGuard]", err?.message, String(err?.stack || "").slice(0, 300)); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="note">
        {this.props.past ? "This page can't be shown for a past night — the saved snapshot doesn't keep everything it needs. " : "This page hit a problem loading. "}
        {this.props.past && <button className="date-back" onClick={() => setViewDate(null)}>Back to tonight</button>}
      </div>
    );
  }
}
