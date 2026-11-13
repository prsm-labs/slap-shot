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
import ScoresTab, { showScoresView } from "./tabs/ScoresTab.jsx"; // 2026-11-05: Live + Schedule + Tonight so far + Goal Tracker
import MatchupsHubTab from "./tabs/MatchupsHubTab.jsx";
import FirstGoalTab from "./tabs/FirstGoalTab.jsx";
import CalledUpTab from "./tabs/CalledUpTab.jsx";
import GameHubTab from "./tabs/GameHubTab.jsx"; // 2026-11-05: 🎬 Game Sim + 🔮 Projections (win model)
import TrackRecordTab from "./tabs/TrackRecordTab.jsx";
import StatsHubTab from "./tabs/StatsHubTab.jsx"; // 2026-11-05: 📊 Stats + Splits + Matchup Lookup
import CheatSheetsTab from "./tabs/CheatSheetsTab.jsx";
import Top3Tab from "./tabs/Top3Tab.jsx";
import MyPicksTab from "./tabs/MyPicksTab.jsx";
import AboutTab from "./tabs/AboutTab.jsx";
import DegenPicksTab from "./tabs/DegenPicksTab.jsx"; // 2026-11-09 🪙 play-money mini game (CourtIQ's)
import { useCoinSettler, useSlip } from "./lib/coins.js";
import TabMenu from "./components/TabMenu.jsx";
import DataStamp from "./components/DataStamp.jsx";
import { OfflineBanner, OfflineMenuButton } from "./components/Offline.jsx";
import offlineConfig from "./lib/offlineConfig.js";
import AppRefresh from "./components/AppRefresh.jsx";
import OddsCalc from "./components/OddsCalc.jsx";

// 2026-11-10: the hardcoded 7/31 build stamp is gone from the footer -- it now shows when the pipeline last updated the data.

// Odds Calculator removed per direct user feedback ("we don't need the odds calculator") —
// OddsCalculatorTab.jsx / lib/odds.js are left on disk, unreferenced, same convention as other
// superseded assets in this repo (not deleted without being asked).
// 2026-11-05 (user: too many pages for a 5-10 minute visit): grouped menu -- Today / Research / Track Record / App. Live + Schedule +
// Tonight so far + Goal Tracker are one 📺 Scores page (key "livegames" kept so every "open the game" link lands there); Splits +
// Matchup Lookup fold into 📊 Stats; 🔮 Projections (the win model) sits beside 🎬 Game Sim. Every old page is still there as a view.
const TABS = [
  { key: "cheat", label: "📋 Cheat Sheets", Component: CheatSheetsTab, group: "Today" },
  { key: "top3", label: "🏆 Top 3 Tonight", Component: Top3Tab, group: "Today" },
  { key: "picks", label: "⭐ My Picks", Component: MyPicksTab, group: "Today" },
  { key: "livegames", label: "📺 Scores", Component: ScoresTab, group: "Today" },
  // Scouting holds All Matchups (default) plus Lamp / Apple / Crease Lab as in-page buttons.
  { key: "board", label: "🎯 Scouting", Component: MatchupsHubTab, group: "Research" },
  // 2026-10-20: every skater / goalie / team, game by game, this season + last (build_stats.py).
  { key: "stats", label: "📊 Stats", Component: StatsHubTab, group: "Research" },
  { key: "gamesim", label: "🎬 Game Sim", Component: GameHubTab, group: "Research" }, // 2026-10-29: RotoBot-style simulated games (replay + 10,000-game box score)
  { key: "firstgoal", label: "🥇 First Goal", Component: FirstGoalTab, group: "Research" },
  { key: "calledup", label: "🆙 Called Up", Component: CalledUpTab, group: "Research" },
  { key: "coins", label: "🪙 Degen Picks", Component: DegenPicksTab, group: "Research" },
  { key: "track", label: "📈 Track Record", Component: TrackRecordTab, group: "Track Record" },
  { key: "about", label: "📌 About", Component: AboutTab, group: "App" },
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
  useCoinSettler(); // 🪙 Degen Picks: settles open picks from the NHL box scores
  const slip = useSlip();

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
          {/* 2026-11-13 (user): 🧮 odds calculator + bankroll basics, Going Yard's math */}
          <OddsCalc />
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
      {/* 2026-11-02 (user): ☰ > 📦 Offline & data (save a time-stamped offline copy, download the numbers); banner while on the copy */}
      <div className="master-bar tm-row"><TabMenu tabs={TABS} tab={tab} setTab={setTab} footer={(close) => <OfflineMenuButton config={offlineConfig} onOpen={close} />} /><DateBar /><MasterFilter /></div>
      <OfflineBanner />

      <NotificationBar />
      <GoalTicker onClick={() => { showScoresView("goals"); setTab("livegames"); }} />
      {/* 2026-10-22: one CourtIQ-style matchup strip above the tabs; it narrows every page */}
      <GameStrip />

      <main className="content">
        <PastNightGuard key={`${tab}|${viewDate || ""}`} past={Boolean(viewDate)}>
          <ActiveComponent key={viewDate || "tonight"} />
        </PastNightGuard>
      </main>

      <div className="footer">
        <span>Slap Shot · prsm-labs</span>
        <DataStamp url="/data/todays_pool.json" pick={(d) => d._meta?.generated} />
      </div>

      <PlayerSlideout />
      {/* 2026-11-09: the Degen Picks slip follows you while you research (filled from the skater slideout's 🪙 section) */}
      {slip.length > 0 && tab !== "coins" && <button type="button" className="dp-float" onClick={() => setTab("coins")}>🧾 Slip · {slip.length}</button>}
    </div>
  );
}
