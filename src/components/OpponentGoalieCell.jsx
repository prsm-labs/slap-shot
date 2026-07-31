import { openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "./PlayerAvatar.jsx";
import GradeBadge from "./GradeBadge.jsx";

export default function OpponentGoalieCell({ player }) {
  if (!player.opponentGoalie) {
    return <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>—</span>;
  }
  return (
    <div
      className="clickable"
      style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      onClick={() => openGoalieSlide({ playerId: player.opponentGoalieId, name: player.opponentGoalie, team: player.opponentTeam })}
    >
      <PlayerAvatar playerId={player.opponentGoalieId} name={player.opponentGoalie} team={player.opponentTeam} size={24} />
      <span className="mono" style={{ fontSize: 11 }}>{player.opponentGoalie}</span>
      <GradeBadge grade={player.goalieGrade} />
    </div>
  );
}
