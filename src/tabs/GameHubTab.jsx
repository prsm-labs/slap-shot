import { useState } from "react";
import ViewPicker from "../components/ViewPicker.jsx";
import GameSimTab from "./GameSimTab.jsx";
import ProjectionsTab from "./ProjectionsTab.jsx";

// 🎬 Games hub (2026-11-05, user: fewer pages): the Game Sim and the old 🔮 Projections page (the team win / score model the sim's win
// chance comes from) on one menu item.
const VIEWS = [["sim", "🎬 Game Sim"], ["proj", "🔮 Win model"]];

export default function GameHubTab() {
  const [view, setView] = useState("sim");
  return (
    <div>
      <ViewPicker options={VIEWS} value={view} onChange={setView} pillClass="pill-btn" rowClass="pill-row" label="Games" />
      {view === "sim" ? <GameSimTab /> : <ProjectionsTab />}
    </div>
  );
}
