import { useState } from "react";
import ViewPicker from "../components/ViewPicker.jsx";
import StatsTab from "./StatsTab.jsx";
import SplitsTab from "./SplitsTab.jsx";
import MatchupLookupTab from "./MatchupLookupTab.jsx";

// 📊 Stats hub (2026-11-05, user: fewer pages). Stats (every skater / goalie / team, game by game) with the old 📊 Splits and
// 🔍 Matchup Lookup pages folded in as views -- splits and head-to-head tested as context only (no edge on our chances), and the
// player slideout already carries both, so they no longer get their own menu items.
const VIEWS = [["stats", "📊 Stats"], ["splits", "📊 Splits"], ["lookup", "🔍 Matchup Lookup"]];

export default function StatsHubTab() {
  const [view, setView] = useState("stats");
  return (
    <div>
      <ViewPicker options={VIEWS} value={view} onChange={setView} pillClass="pill-btn" rowClass="pill-row" label="Stats" />
      {view === "stats" && <StatsTab />}
      {view === "splits" && <SplitsTab />}
      {view === "lookup" && <MatchupLookupTab />}
    </div>
  );
}
