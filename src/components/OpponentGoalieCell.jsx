import { openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "./PlayerAvatar.jsx";
import GradeBadge from "./GradeBadge.jsx";

// ✅ = confirmed / in net (lib/data.js live slate pool); LIVE / FINAL once the game has started.
const STATE_TAG = { LIVE: "LIVE", CRIT: "LIVE", FINAL: "FINAL", OFF: "FINAL" };

export default function OpponentGoalieCell({ player }) {
  if (!player.opponentGoalie) {
    return <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>—</span>;
  }
  const tag = STATE_TAG[player.gameState];
  const title = [
    player.opponentGoalieStatus,
    player.opponentGoalieWas && player.opponentGoalieWas !== player.opponentGoalie ? `pool had ${player.opponentGoalieWas}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div
      className="clickable"
      style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      title={title || undefined}
      onClick={() => openGoalieSlide({ playerId: player.opponentGoalieId, name: player.opponentGoalie, team: player.opponentTeam })}
    >
      <PlayerAvatar playerId={player.opponentGoalieId} name={player.opponentGoalie} team={player.opponentTeam} size={24} />
      <span className="mono" style={{ fontSize: 11 }}>{player.opponentGoalie}{player.opponentGoalieConfirmed ? " ✅" : ""}</span>
      <GradeBadge grade={player.goalieGrade} />
      {tag && <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: tag === "LIVE" ? "var(--green)" : "var(--muted)" }}>{tag}</span>}
    </div>
  );
}
