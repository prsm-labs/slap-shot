import { useState } from "react";

// Ported from Going Yard's real PlayerAvatar (mlb_project/going-yard/src/App.jsx:623-651):
// try a real headshot first, fall back to initials on error — never a hard failure. Going Yard
// uses the exact same component for batters AND pitchers (no separate logic per role); this does
// the same for skaters and goalies. Rounded-square (not circle), portrait aspect ratio, crops
// toward the top of the image for face framing — same visual language as the reference.
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
  const src = headshotUrl(playerId, team);
  const height = Math.round(size * 1.25);

  if (!src || failed) {
    return (
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
    );
  }

  return (
    <img
      src={src}
      alt={name || ""}
      onError={() => setFailed(true)}
      style={{
        width: size, height, borderRadius: 6, objectFit: "cover", objectPosition: "center 15%",
        border: "1px solid var(--border)", background: "var(--surface2)", flexShrink: 0,
      }}
    />
  );
}
