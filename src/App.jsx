import { useMemo, useState } from "react";
import "./App.css";
import logoMark from "./assets/logo-flame-puck.png";
import PlayerSlideout from "./components/PlayerSlideout.jsx";
import GoalTicker from "./components/GoalTicker.jsx";
import DashboardTab from "./tabs/DashboardTab.jsx";
import GoalTrackerTab from "./tabs/GoalTrackerTab.jsx";
import LiveTab from "./tabs/LiveTab.jsx";
import MatchupsHubTab from "./tabs/MatchupsHubTab.jsx";
import FirstGoalTab from "./tabs/FirstGoalTab.jsx";
import TrackRecordTab from "./tabs/TrackRecordTab.jsx";
import LiveThemesTab from "./tabs/LiveThemesTab.jsx";
import SplitsTab from "./tabs/SplitsTab.jsx";
import CheatSheetsTab from "./tabs/CheatSheetsTab.jsx";
import Top3Tab from "./tabs/Top3Tab.jsx";
import MyPicksTab from "./tabs/MyPicksTab.jsx";
import MatchupLookupTab from "./tabs/MatchupLookupTab.jsx";
import AboutTab from "./tabs/AboutTab.jsx";

const BUILD_TIMESTAMP = "2026-07-31 13:28 ET";

// Odds Calculator removed per direct user feedback ("we don't need the odds calculator") —
// OddsCalculatorTab.jsx / lib/odds.js are left on disk, unreferenced, same convention as other
// superseded assets in this repo (not deleted without being asked).
const TABS = [
  { key: "cheat", label: "📋 Cheat Sheets", Component: CheatSheetsTab },
  { key: "top3", label: "🏆 Top 3 Tonight", Component: Top3Tab },
  { key: "picks", label: "⭐ My Picks", Component: MyPicksTab },
  { key: "livegames", label: "🔴 Live", Component: LiveTab },
  { key: "goals", label: "🚨 Goal Tracker", Component: GoalTrackerTab },
  // Scouting holds All Matchups (default) plus Lamp / Apple / Crease Lab as in-page buttons.
  { key: "board", label: "🎯 Scouting", Component: MatchupsHubTab },
  { key: "firstgoal", label: "🥇 First Goal", Component: FirstGoalTab },
  { key: "track", label: "📈 Track Record", Component: TrackRecordTab },
  // Goal flurries by date (live tonight, nightly log before). Formerly "Live Themes".
  { key: "live", label: "⚡ Goal Flurries", Component: LiveThemesTab },
  { key: "splits", label: "📊 Splits", Component: SplitsTab },
  { key: "dashboard", label: "📊 Dashboard", Component: DashboardTab },
  { key: "lookup", label: "🔍 Matchup Lookup", Component: MatchupLookupTab },
  { key: "about", label: "📌 About", Component: AboutTab },
];

export default function App() {
  const [tab, setTab] = useState("cheat");
  const active = useMemo(() => TABS.find((t) => t.key === tab) || TABS[0], [tab]);
  const ActiveComponent = active.Component;

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <img className="logo-mark" src={logoMark} alt="Slap Shot" />
          <span>SLAP</span> SHOT
        </div>
        <div className="badges">
          <div className="badge live">
            <div className="badge-dot" />
            LIVE
          </div>
          <div className="badge">PRSM LABS</div>
        </div>
      </header>

      <GoalTicker onClick={() => setTab("goals")} />

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        <ActiveComponent />
      </main>

      <div className="footer">
        <span>Slap Shot · Build {BUILD_TIMESTAMP} · prsm-labs</span>
      </div>

      <PlayerSlideout />
    </div>
  );
}
