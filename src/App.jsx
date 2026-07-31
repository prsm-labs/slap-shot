import { useMemo, useState } from "react";
import "./App.css";
import logoMark from "./assets/logo-flame-puck.png";
import PlayerSlideout from "./components/PlayerSlideout.jsx";
import GoalTicker from "./components/GoalTicker.jsx";
import DashboardTab from "./tabs/DashboardTab.jsx";
import AllMatchupsTab from "./tabs/AllMatchupsTab.jsx";
import LampLabTab from "./tabs/LampLabTab.jsx";
import AppleLabTab from "./tabs/AppleLabTab.jsx";
import TrackRecordTab from "./tabs/TrackRecordTab.jsx";
import LiveThemesTab from "./tabs/LiveThemesTab.jsx";
import SplitsTab from "./tabs/SplitsTab.jsx";
import CheatSheetsTab from "./tabs/CheatSheetsTab.jsx";
import MatchupLookupTab from "./tabs/MatchupLookupTab.jsx";
import AboutTab from "./tabs/AboutTab.jsx";

const BUILD_TIMESTAMP = "2026-07-31 13:28 ET";

// Odds Calculator removed per direct user feedback ("we don't need the odds calculator") —
// OddsCalculatorTab.jsx / lib/odds.js are left on disk, unreferenced, same convention as other
// superseded assets in this repo (not deleted without being asked).
const TABS = [
  { key: "dashboard", label: "📊 Dashboard", Component: DashboardTab },
  { key: "board", label: "🏒 All Matchups", Component: AllMatchupsTab },
  { key: "lamp", label: "💡 Lamp Lab", Component: LampLabTab },
  { key: "apple", label: "🍎 Apple Lab", Component: AppleLabTab },
  { key: "track", label: "📈 Track Record", Component: TrackRecordTab },
  { key: "live", label: "⚡ Live Themes", Component: LiveThemesTab },
  { key: "splits", label: "📊 Splits", Component: SplitsTab },
  { key: "cheat", label: "📋 Cheat Sheets", Component: CheatSheetsTab },
  { key: "lookup", label: "🔍 Matchup Lookup", Component: MatchupLookupTab },
  { key: "about", label: "📌 About", Component: AboutTab },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
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

      <GoalTicker onClick={() => setTab("board")} />

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
