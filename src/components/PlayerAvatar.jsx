import { useState } from "react";
import { goalBadgeFor, goalBadgeLabel, useTodayGoals } from "../lib/todayGoals.js";

// Ported from Going Yard's real PlayerAvatar (mlb_project/going-yard/src/App.jsx:623-651):
// try a real headshot first, fall back to initials on error — never a hard failure. Going Yard
// uses the exact same component for batters AND pitchers (no separate logic per role); this does
// the same for skaters and goalies. Rounded-square (not circle), portrait aspect ratio, crops
// toward the top of the image for face framing — same visual language as the reference.
//
// Goal badge (lib/todayGoals.js), like Going Yard's "gone yard" badge — shown on the photo
// everywhere a skater appears: 🚨 scored today (×2 for two), 🎩 hat trick, and a pulsing ring + 👀
// for HAT WATCH (2 goals in a game still going). Resets at the next day's first goal.
const NHL_SEASON_ID = "20262027"; // current season, so players who changed teams get this year's photo

function headshotUrl(playerId, team) {
  if (!playerId || !team) return null;
  return `https://assets.nhle.com/mugs/nhl/${NHL_SEASON_ID}/${team}/${playerId}.png`;
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
}

export default function PlayerAvatar({ playerId, name, team, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const { byPlayer, date } = useTodayGoals();
  const src = headshotUrl(playerId, team);
  const height = Math.round(size * 1.25);
  const badge = goalBadgeLabel(goalBadgeFor(byPlayer, playerId), date);
  const watch = badge?.icon === "👀";

  const pic = !src || failed ? (
    <div
      className="mono"
      style={{
        width: size, height, borderRadius: 6, background: "var(--surface2)",
        border: "1px solid var(--border)", color: "var(--muted)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.34), fontWeight: 700, flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  ) : (
    <img
      src={src}
      alt={name || ""}
      onError={() => setFailed(true)}
      style={{
        width: size, height, borderRadius: 6, objectFit: "cover", objectPosition: "center 15%",
        border: "1px solid var(--border)", background: "var(--surface2)", flexShrink: 0, display: "block",
      }}
    />
  );
  if (!badge) return pic;

  const fs = Math.max(13, Math.round(size * 0.42));
  return (
    <div title={badge.title} style={{ position: "relative", flexShrink: 0, width: size, height, borderRadius: 6, animation: watch ? "ss-hatwatch 1.2s ease-in-out infinite" : undefined }}>
      {watch && <style>{"@keyframes ss-hatwatch { 0%,100% { box-shadow: 0 0 0 1px #ffb020 } 50% { box-shadow: 0 0 0 3px #ffb020, 0 0 12px #ffb020 } }"}</style>}
      {pic}
      <span
        style={{
          position: "absolute", top: -Math.round(fs * 0.5), right: -Math.round(fs * 0.6), fontSize: fs, lineHeight: 1,
          padding: 2, borderRadius: 999, background: "var(--bg)", border: "1px solid var(--border)",
          pointerEvents: "none", whiteSpace: "nowrap", zIndex: 1,
        }}
      >
        {badge.icon}
        {badge.count > 1 && badge.icon === "🚨" ? <span className="mono" style={{ fontSize: Math.max(8, fs * 0.6), fontWeight: 800, color: "#fff" }}>×{badge.count}</span> : null}
      </span>
    </div>
  );
}
