import { useState } from "react";
import AllMatchupsTab from "./AllMatchupsTab.jsx";
import LampLabTab from "./LampLabTab.jsx";
import AppleLabTab from "./AppleLabTab.jsx";
import CreaseLabTab from "./CreaseLabTab.jsx";

// "Scouting" top-level tab: All Matchups (the default view) plus every lab, switched by a button row in the
// page itself instead of one top-level tab each.
const VIEWS = [
  { key: "board", label: "🏒 All Matchups", Component: AllMatchupsTab },
  { key: "lamp", label: "💡 Lamp Lab", Component: LampLabTab },
  { key: "apple", label: "🍎 Apple Lab", Component: AppleLabTab },
  { key: "crease", label: "🥅 Crease Lab", Component: CreaseLabTab },
];

export default function MatchupsHubTab() {
  const [view, setView] = useState("board");
  const Active = (VIEWS.find((v) => v.key === view) || VIEWS[0]).Component;
  return (
    <div>
      <div className="pill-row" style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 14 }}>
        {VIEWS.map((v) => (
          <button key={v.key} className={`pill-btn ${view === v.key ? "active" : ""}`} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}
