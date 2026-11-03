import { useState } from "react";
import ViewPicker from "../components/ViewPicker.jsx";
import AllMatchupsTab from "./AllMatchupsTab.jsx";
import LampLabTab from "./LampLabTab.jsx";
import AppleLabTab from "./AppleLabTab.jsx";
import CreaseLabTab from "./CreaseLabTab.jsx";
import PairsTab from "./PairsTab.jsx";
import LadderTab from "./LadderTab.jsx";
import RiskSliderTab from "./RiskSliderTab.jsx";
import RadarTab from "./RadarTab.jsx";
import MultiTab from "./MultiTab.jsx";
import SlateStatus from "../components/SlateStatus.jsx";

// "Scouting" top-level tab: All Matchups (the default view) plus every lab, switched by a button row in the
// page itself instead of one top-level tab each.
const VIEWS = [
  { key: "board", label: "🏒 All Matchups", Component: AllMatchupsTab },
  { key: "risk", label: "🎚️ Risk Slider", Component: RiskSliderTab },  // 2026-10-27: safe -> long shot over every skater's ladder
  { key: "radar", label: "🔦 Under the radar", Component: RadarTab },  // 2026-11-02: lines he rarely hits that the model likes tonight
  { key: "multi", label: "🎯 Multi-point", Component: MultiTab },  // 2026-11-03: 2+ points / 2+ assists beyond his usual
  { key: "lamp", label: "💡 Lamp Lab", Component: LampLabTab },
  { key: "apple", label: "🍎 Apple Lab", Component: AppleLabTab },
  { key: "crease", label: "🥅 Crease Lab", Component: CreaseLabTab },
  { key: "pairs", label: "🤝 Pairs", Component: PairsTab },
  { key: "ladder", label: "🪜 Game Ladder", Component: LadderTab },
];

export default function MatchupsHubTab() {
  const [view, setView] = useState("board");
  const Active = (VIEWS.find((v) => v.key === view) || VIEWS[0]).Component;
  return (
    <div>
      <ViewPicker options={VIEWS.map((v) => [v.key, v.label])} value={view} onChange={setView} pillClass="pill-btn" label="Scouting"
        style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 14 }} />
      <SlateStatus />
      <Active />
    </div>
  );
}
