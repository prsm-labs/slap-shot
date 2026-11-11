// 2026-11-11 Quick read (components/QuickRead.jsx, shared with CourtIQ / Six Points / Final Lap): the slideout's short "why"
// box. Only tested factors speak, sized by how much each moves his POINT chance (1+ point), biggest first, under 1 pt dropped:
//   model terms (already inside his chances): opponent defense (MATCHUP_COEF x slate z of xGA), ice-time trend (ROLE), the
//   opposing starter (GOALIE_COEF x GSAx z) -- the size is what the term adds to tonight's point chance;
//   tested edges (lib/edges.js, beat or missed our chance every held-out season): their held-out points;
//   🧊 streak check: a caution (~2 pts under, 3 of 4 seasons).
// Not here on purpose: H2H, defense vs position, home / road splits (tested as noise; still in the folded sections below).
import { pickLines } from "../components/QuickRead.jsx";
import { EDGES, edgeKeys } from "./edges.js";
import { GOALIE_COEF, MATCHUP_COEF } from "./grades.js";
import { ROLE } from "./calibration.js";

const logit = (p) => Math.log(p / (1 - p));
const sig = (x) => 1 / (1 + Math.exp(-x));
// points of chance a logit term d added to the final chance p
const added = (p, d) => (p == null || !d ? 0 : (p - sig(logit(Math.min(Math.max(p, 1e-4), 1 - 1e-4)) - d)) * 100);
const sgn = (x) => (x >= 0 ? `+${Math.round(x)}` : `−${Math.round(-x)}`);
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const last = (name) => String(name || "").split(" ").slice(-1)[0];
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

const EDGE_PTS = { oppb2b: 1.4, restedge: 3.7, homefav: 3.1, roaddog: -4.5, altb2b: -7.0 };
const EDGE_TEXT = {
  oppb2b: (p) => `${p.opponentTeam} played last night`,
  restedge: () => "2+ more days of rest than the opponent",
  homefav: () => "Home favorite",
  roaddog: () => "Road underdog",
  altb2b: (p) => `2nd night of a back-to-back at ${p.opponentTeam}`,
};

export function quickReadSkater(p, meta) {
  const pr = p?.effectiveGrade?.probs;
  if (!pr) return null;
  const c = [];
  const pt = pr.point;
  // opponent defense (league rank by xGA, the Opp D column's number)
  if (pr.oppZ) {
    const d = added(pt, MATCHUP_COEF.point * pr.oppZ);
    const r = meta?.defRank?.[p.opponentTeam]?.rank, n = Object.keys(meta?.defRank || {}).length || 32;
    const where = r ? (r <= n / 2 ? `${ord(r)} softest` : `${ord(n - r + 1)} stingiest`) : d > 0 ? "a soft" : "a stingy";
    // label by league rank (the Opp D column): 10 softest / 10 stingiest; the size still comes from tonight's slate z
    const lab = r && r <= 10 ? "Soft matchup" : r && r > n - 10 ? "Tough matchup" : "Matchup";
    c.push({ dir: d > 0 ? "up" : "down", w: d, text: `${lab}: ${p.opponentTeam} ${where} D (${sgn(d)} pts)` });
  }
  if (pr.role) {
    const d = added(pt, ROLE.point * pr.role);
    const ch = Math.round((Math.exp(pr.role) - 1) * 100);
    c.push({ dir: d > 0 ? "up" : "down", w: d, text: `Ice time ${ch > 0 ? "up" : "down"} ${Math.abs(ch)}% the last 3 games (${sgn(d)} pts)` });
  }
  if (pr.goalieZ && p.opponentGoalie) {
    const d = added(pt, GOALIE_COEF.point * pr.goalieZ);
    c.push({ dir: d > 0 ? "up" : "down", w: d, text: `${d > 0 ? "Weaker" : "Stronger"} goalie than average: ${last(p.opponentGoalie)} (${sgn(d)} pts)` });
  }
  for (const k of edgeKeys(p, meta)) {
    const e = EDGES.find((x) => x.v === k);
    const w = EDGE_PTS[k];
    if (e && w) c.push({ dir: w > 0 ? "up" : "down", w, text: `${e.label.split(" ")[0]} ${EDGE_TEXT[k](p)}: ran ${sgn(w)} pts vs our chance` });
  }
  if (p.streakCheck) c.push({ dir: "warn", w: 2, text: `Hot run (${p.streakCheck.l5} pts in 5) into a defense that isn't soft: a caution` });
  return {
    title: `Quick read · vs ${p.opponentTeam}`,
    lines: pickLines(c),
    chances: `Goal ${pct(pr.goal)} · Point ${pct(pr.point)} · 3+ SOG ${pct(pr.sog3)}`,
    note: "pts = change to his point chance. Plain lines are already in his %; emoji lines are tested spots that ran past (or under) it.",
  };
}
