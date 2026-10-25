import { useEffect, useMemo, useState } from "react";
import "./App.css";
import PlayerSlideout from "./components/PlayerSlideout.jsx";
import GoalTicker from "./components/GoalTicker.jsx";
import NotificationBar, { AlertBell } from "./components/NotificationBar.jsx";
import { installColumnResize } from "./lib/columnResize.js";
import GameStrip from "./components/GameStrip.jsx";
import DateBar, { PastNightGuard } from "./components/DateBar.jsx";
import MasterFilter from "./components/MasterFilter.jsx";
import { useViewDate } from "./lib/data.js";
import { tabRequest } from "./lib/nav.js";
import GoalTrackerTab from "./tabs/GoalTrackerTab.jsx";
import LiveTab from "./tabs/LiveTab.jsx";
import MatchupsHubTab from "./tabs/MatchupsHubTab.jsx";
import FirstGoalTab from "./tabs/FirstGoalTab.jsx";
import CalledUpTab from "./tabs/CalledUpTab.jsx";
import ProjectionsTab from "./tabs/ProjectionsTab.jsx";
import TrackRecordTab from "./tabs/TrackRecordTab.jsx";
import TonightSoFarTab from "./tabs/TonightSoFarTab.jsx"; // 2026-10-25: holds Goal Flurries (LiveThemesTab) as its 2nd view
import SplitsTab from "./tabs/SplitsTab.jsx";
import StatsTab from "./tabs/StatsTab.jsx";
import ScheduleTab from "./tabs/ScheduleTab.jsx";
import CheatSheetsTab from "./tabs/CheatSheetsTab.jsx";
import Top3Tab from "./tabs/Top3Tab.jsx";
import MyPicksTab from "./tabs/MyPicksTab.jsx";
import MatchupLookupTab from "./tabs/MatchupLookupTab.jsx";
import AboutTab from "./tabs/AboutTab.jsx";
import TabMenu from "./components/TabMenu.jsx";
import AppRefresh from "./components/AppRefresh.jsx";

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
  // 2026-10-20: every skater / goalie / team, game by game, this season + last (build_stats.py).
  { key: "stats", label: "📊 Stats", Component: StatsTab },
  { key: "schedule", label: "📅 Schedule", Component: ScheduleTab }, // 2026-10-23: upcoming games + recent scores
  { key: "projections", label: "🔮 Projections", Component: ProjectionsTab },
  { key: "firstgoal", label: "🥇 First Goal", Component: FirstGoalTab },
  { key: "calledup", label: "🆙 Called Up", Component: CalledUpTab },
  { key: "track", label: "📈 Track Record", Component: TrackRecordTab },
  // Goal flurries by date (live tonight, nightly log before). Formerly "Live Themes".
  // 2026-10-25: now 📡 Tonight so far (the slate vs our chances, context only) with ⚡ Goal Flurries as its second view.
  { key: "live", label: "📡 Tonight so far", Component: TonightSoFarTab },
  { key: "splits", label: "📊 Splits", Component: SplitsTab },
  { key: "lookup", label: "🔍 Matchup Lookup", Component: MatchupLookupTab },
  { key: "about", label: "📌 About", Component: AboutTab },
];

export default function App() {
  const [tab, setTab] = useState("cheat");
  const active = useMemo(() => TABS.find((t) => t.key === tab) || TABS[0], [tab]);
  const ActiveComponent = active.Component;
  const viewDate = useViewDate();
  // Drag-to-resize table columns, app-wide (lib/columnResize.js).
  useEffect(() => installColumnResize(), []);
  // 2026-10-23: a Schedule row / slideout matchup asks for the Live tab (lib/nav.js openGame)
  const tabReq = tabRequest.use();
  useEffect(() => { if (tabReq) setTab(tabReq.tab); }, [tabReq]);

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          {/* 2026-10-23 new logo (crossed sticks): dark tile, accent tile in light mode; flame-puck retired */}<picture><source media="(prefers-color-scheme: light)" srcSet="/logo-accent.svg" /><img className="logo-mark" src="/logo-dark.svg" alt="Slap Shot" /></picture>
          <span>SLAP</span> SHOT
        </div>
        <div className="badges">
          {/* 2026-10-25 (user): app refresh button -- reloads the page with fresh data */}
          <AppRefresh />
          <AlertBell />
          <div className="badge live">
            <div className="badge-dot" />
            LIVE
          </div>
          <div className="badge">PRSM LABS</div>
        </div>
      </header>
      {/* 2026-10-24 (user prototype): ☰ page menu first in the row under the logo, then the date picker, team and search */}
      {/* 2026-10-23: 📅 night picker -- a past night swaps every page to that night's frozen slate + results */}
      <div className="master-bar tm-row"><TabMenu tabs={TABS} tab={tab} setTab={setTab} /><DateBar /><MasterFilter /></div>

      <NotificationBar />
      <GoalTicker onClick={() => setTab("goals")} />
      {/* 2026-10-22: one CourtIQ-style matchup strip above the tabs; it narrows every page */}
      <GameStrip />

      <main className="content">
        <PastNightGuard key={`${tab}|${viewDate || ""}`} past={Boolean(viewDate)}>
          <ActiveComponent key={viewDate || "tonight"} />
        </PastNightGuard>
      </main>

      <div className="footer">
        <span>Slap Shot · Build {BUILD_TIMESTAMP} · prsm-labs</span>
      </div>

      <PlayerSlideout />
    </div>
  );
}
