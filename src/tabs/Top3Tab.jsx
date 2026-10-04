import { useEffect, useMemo, useState } from "react";
import { refreshPool, useScoredPool } from "../lib/data.js";
import { eligibleForTop3, pickRecord, selectTop3, TIERS } from "../lib/top3.js";
import { openGoalieSlide, openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";

// Top 3 Tonight — the best real matchup per tier (Chalk / Mid-Tier / Longshot), deterministic, no
// randomness, modeled on Going Yard's "Top 4 Tonight". Picks are computed live (lib/top3.js on the
// live slate pool) until the 5:30 PM ET pipeline run freezes them into public/data/top3/<date>.json
// (scripts/lock_top3.mjs); after that every visit shows that file and nothing is recomputed.
const TIER = Object.fromEntries(TIERS.map((t) => [t.key, t]));
const LOCK_CHECK_MS = 5 * 60_000;
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Pill({ color, children, title }) {
  return (
    <span title={title} className="mono" style={{ fontSize: 9, padding: "3px 7px", borderRadius: 10, border: `1px solid ${color}`, color, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Top3Card({ pick, flipped, onFlip, poolById }) {
  const tier = TIER[pick.tier];
  const c = tier.color;
  const frame = {
    position: "absolute", inset: 0, borderRadius: 14, border: `1px solid ${c}`, boxShadow: `0 0 18px ${c}40`,
    background: `linear-gradient(150deg, ${c}26 0%, var(--surface) 55%, var(--bg) 100%)`,
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", padding: 14, display: "flex", flexDirection: "column", gap: 8,
  };
  const p = pick.playerId ? pick : null;
  const full = p ? poolById.get(p.playerId) : null;
  const openSkater = () => p && openSkaterSlide(full || { playerId: p.playerId, name: p.name, team: p.team });

  return (
    <div style={{ width: 240, height: 430, flex: "0 0 auto", perspective: 1000, scrollSnapAlign: "start" }}>
      <div
        onClick={() => !flipped && p && onFlip()}
        style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform .6s", transform: `rotateY(${flipped ? 180 : 0}deg)`, cursor: flipped || !p ? "default" : "pointer" }}
      >
        {/* Face-down side */}
        <div style={{ ...frame, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>{tier.emoji}</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 22, color: c, letterSpacing: 1 }}>{tier.label.toUpperCase()}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{tier.blurb}</div>
          <div className="mono" style={{ fontSize: 11, marginTop: 18, color: p ? "var(--text)" : "var(--muted)" }}>
            {p ? "TAP TO REVEAL" : `No qualifying skater in this tier tonight`}
          </div>
        </div>

        {/* Revealed side */}
        <div style={{ ...frame, transform: "rotateY(180deg)" }}>
          {p && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 15, color: c }}>{tier.emoji} {tier.label.toUpperCase()}</span>
                {p.lineupStatus === "dressed" && <span title="In tonight's official lineup">✅</span>}
              </div>
              <div className="clickable" onClick={openSkater} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={52} />
                <div>
                  <div className="player-name-link" style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{p.team} · {p.position}</div>
                </div>
              </div>
              <div
                className="mono clickable"
                style={{ fontSize: 11, cursor: p.opponentGoalieId ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => p.opponentGoalieId && openGoalieSlide({ playerId: p.opponentGoalieId, name: p.opponentGoalie, team: p.opp })}
              >
                {p.isHome ? "vs" : "@"} {p.opp} · {p.opponentGoalie || "goalie TBD"} {p.goalieGrade && <GradeBadge grade={{ letter: p.goalieGrade }} />}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {p.grade && <Pill color={c} title="Tonight's grade (slate percentile of the grade model)">Grade {p.grade}</Pill>}
                <Pill color={c} title="Grade-model chance to score, before the matchup">Model {p.modelGoalPct}%</Pill>
                <Pill color={c} title="Chance to score adjusted for the opponent's defense">To score {p.adjGoalPct}%</Pill>
                <Pill color={c} title="Opponent's expected goals allowed per game, ranked softest first">#{p.softRank} soft D</Pill>
                {p.sogL5 != null && <Pill color={c} title="Shots on goal per game: last 5 / season">SOG {p.sogL5} / {p.sogPg}</Pill>}
                {pick.tier === "mid" && <Pill color={c}>{p.fallback ? "Fallback — didn't meet the bar" : "✓ Trend + soft matchup"}</Pill>}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: "var(--text)", flex: 1, overflow: "hidden" }}>{p.why}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
                <PickButton player={{ playerId: p.playerId, name: p.name, team: p.team }} size="lg" />
                <button className="btn" style={{ borderColor: c }} onClick={openSkater}>Open player</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentResults({ rows }) {
  if (!rows?.length) return null;
  const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date) || TIERS.findIndex((t) => t.key === a.tier) - TIERS.findIndex((t) => t.key === b.tier));
  const byTier = TIERS.map((t) => {
    const r = rows.filter((x) => x.tier === t.key && x.actual?.played);
    return { ...t, n: r.length, goals: r.filter((x) => x.actual.g > 0).length, expected: r.reduce((s, x) => s + x.adjGoalPct / 100, 0) };
  });
  return (
    <div style={{ marginTop: 22 }}>
      <div className="section-title" style={{ fontSize: 18 }}>📈 How the locked picks did</div>
      <div className="signal-board" style={{ flexWrap: "wrap", marginTop: 8 }}>
        {byTier.map((t) => (
          <div key={t.key} className="signal-tile">
            <div className="lbl">{t.emoji} {t.label}</div>
            <div className="val">{t.n ? `${t.goals}/${t.n}` : "—"}</div>
            <div className="sub">scored · expected {t.expected.toFixed(1)}</div>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Tier</th><th>Skater</th><th>To score</th><th>G</th><th>A</th><th>SOG</th><th>Result</th></tr></thead>
          <tbody>
            {recent.map((r) => (
              <tr key={`${r.date}-${r.tier}`}>
                <td className="mono">{Number(r.date.slice(5, 7))}/{Number(r.date.slice(8, 10))}</td>
                <td>{TIER[r.tier]?.emoji} {TIER[r.tier]?.label}{r.fallback ? " (fallback)" : ""}</td>
                <td>{r.name ? `${r.name} (${r.team} vs ${r.opp})` : "—"}</td>
                <td>{r.adjGoalPct != null ? `${r.adjGoalPct}%` : "—"}</td>
                <td>{r.actual?.played ? r.actual.g : "—"}</td>
                <td>{r.actual?.played ? r.actual.a : "—"}</td>
                <td>{r.actual?.played ? r.actual.sog : "—"}</td>
                <td>{!r.name ? "—" : !r.actual?.played ? "Did not play" : r.actual.g > 0 ? "✅ Goal" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Top3Tab() {
  const pool = useScoredPool({ includeStarted: true });
  const date = pool?.meta?.slateDate;
  const [locked, setLocked] = useState(null); // locked record for `date`, or false when none yet
  const [now, setNow] = useState(() => Date.now());
  const [flipped, setFlipped] = useState({}); // tier -> playerId that's been revealed
  const [help, setHelp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lockCheck, setLockCheck] = useState(0);
  const [results, setResults] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // The locked record, once the 5:30 PM run has written it.
  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    let timer = null;
    async function load() {
      try {
        const res = await fetch(`/data/top3/${date}.json`, { cache: "no-cache" });
        const body = res.ok ? await res.json() : null;
        if (cancelled) return;
        setLocked(body?.picks ? body : false);
        if (!body?.picks) timer = setTimeout(load, LOCK_CHECK_MS);
      } catch {
        if (!cancelled) {
          setLocked(false);
          timer = setTimeout(load, LOCK_CHECK_MS);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [date, lockCheck]);

  useEffect(() => {
    fetch("/data/track_record_2026.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setResults(d?.top3Rows || []))
      .catch(() => setResults([]));
  }, []);

  const live = useMemo(() => {
    if (!pool) return null;
    const eligible = eligibleForTop3(pool.players, pool.meta.slate, now);
    const { picks } = selectTop3(eligible);
    return {
      picks: picks.map(pickRecord),
      eligible: eligible.length,
      confirmed: eligible.filter((p) => p.lineupStatus === "dressed").length,
    };
  }, [pool, now]);

  const poolById = useMemo(() => new Map((pool?.players || []).map((p) => [p.playerId, p])), [pool]);

  async function refresh() {
    setRefreshing(true);
    await refreshPool();
    setLockCheck((n) => n + 1);
    setNow(Date.now());
    setRefreshing(false);
  }

  if (!pool || locked === null) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;

  const isLocked = Boolean(locked);
  const picks = isLocked ? locked.picks : live.picks;
  const eligible = isLocked ? locked._meta.eligible : live.eligible;
  const confirmed = isLocked ? locked._meta.confirmed : live.confirmed;
  const day = new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  return (
    <div>
      <div className="section-header" style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="section-title">🏆 Top 3 Tonight</div>
          <div className="section-sub">The best real matchup in each tier for {day} — no randomness. Tap a card to reveal.</div>
        </div>
        <span className="mono" style={{ fontSize: 11, alignSelf: "center" }}>
          {eligible} eligible / {confirmed} in official lineups ·{" "}
          {isLocked ? `🔒 Locked ${timeOf(locked._meta.lockedAt)}` : "Live — locks at the 5:30 PM ET update"}
        </span>
        {!isLocked && <button className="btn" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "⟳ Refresh"}</button>}
        <button className={`btn ${help ? "primary" : ""}`} onClick={() => setHelp((v) => !v)} title="How Top 3 works">?</button>
      </div>

      {help && (
        <div className="note" style={{ lineHeight: 1.6 }}>
          <b>How it works.</b> Tonight's eligible skaters (not ruled out or scratched, game not started) are ranked by the grade model's
          chance to score, adjusted for the opponent's defense (expected goals allowed per game). Each tier takes its single best
          matchup-adjusted chance, and no skater appears twice.<br />
          🎯 <b>Chalk</b>: top 15% of the slate by the model, facing a defense in the softer half. ⚖️ <b>Mid-Tier</b>: 50th-85th percentile,
          and it must clear an extra bar — a defense in the softest third AND shots on goal over the last 5 games at least 1.2x the season rate.
          🎲 <b>Longshot</b>: below the slate median, facing one of the softest quarter of defenses.<br />
          <b>Why Mid-Tier has an extra bar:</b> backtested on 2025-26, that combination scored 14-24% more often than the model expected, in both
          halves of the season. If nobody clears it, the card shows the best mid-tier chance and says it's a fallback.<br />
          <b>What didn't make it:</b> goalie-specific weak spots (by shot type, distance, rush/rebound) didn't repeat from one half of last
          season to the other, and neither the opposing goalie's save % nor "scored last game" changed the odds once the model and the
          opponent's defense were counted — so none of them are used. Longshots scored about 8% of the time last season: a long shot, not a hidden edge.<br />
          <b>When it locks:</b> picks update live with lineup and goalie news until the 5:30 PM ET pipeline run, which freezes them for the
          day. After that every visit shows the same three, and the Track Record grades exactly those.<br />
          <b>Not a random pick:</b> every card is the literal top of its tier — the same inputs always give the same three.
        </div>
      )}

      <div style={{ display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory", padding: "6px 2px 14px" }}>
        {TIERS.map((t) => {
          const pick = picks.find((p) => p.tier === t.key) || { tier: t.key };
          return (
            <Top3Card
              key={t.key}
              pick={pick}
              poolById={poolById}
              flipped={Boolean(pick.playerId) && flipped[t.key] === pick.playerId}
              onFlip={() => setFlipped((f) => ({ ...f, [t.key]: pick.playerId }))}
            />
          );
        })}
      </div>

      <RecentResults rows={results} />
    </div>
  );
}
