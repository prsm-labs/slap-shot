import { useEffect, useMemo, useState } from "react";
import PropBand, { chanceAt, hitsOf, ownLine, stepFrom } from "../components/PropBand.jsx";
import GamblyButton from "../components/GamblyButton.jsx";
import { formBefore, ladderFor } from "./lineBoard.js";

// 📱 Prop band for a lab (2026-11-03, user: blend the mockup's prop card into the phone cards). One stat per lab (Lamp Lab = goals,
// Apple Lab = shots on goal): each skater's ladder priced exactly like the Risk Slider (lib/lineBoard.js on line_board.json), the
// line stepped with − / + for the whole lab (remembered), else his own line; hit rates from his last-20 form. Phone cards only.
const KEY = { SOG: "s", PTS: "p", G: "g", A: "a" };
const WORD = { SOG: ["Shot on Goal", "Shots on Goal"], PTS: ["Point", "Points"], G: ["Goal", "Goals"], A: ["Assist", "Assists"] };
const SHORT = { SOG: "SOG", PTS: "PTS", G: "G", A: "A" };

function probsOf(p, past) {
  return {
    SOG: past ? (p.modelSog3Pct != null ? p.modelSog3Pct / 100 : null) : p.modelProbs?.sog3 ?? null,
    PTS: p.anytimePointPct != null ? p.anytimePointPct / 100 : null,
    G: p.anytimeGoalPct != null ? p.anytimeGoalPct / 100 : null,
    A: past ? null : p.modelProbs?.assist ?? null,
  };
}

export function useLabBand(stat, live) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/data/line_board.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => alive && setData(d)).catch(() => alive && setData(null));
    return () => { alive = false; };
  }, []);
  const past = Boolean(live?.past);
  const date = live?.meta?.slateDate;
  const ladders = useMemo(() => {
    const out = new Map();
    if (!data?.form || !live?.players) return out;
    for (const p of live.players) {
      const f0 = data.form[p.playerId];
      const form = past ? formBefore(f0, date) : f0;
      if (!form || form.s.length < data.model.min_games) continue;
      const lines = ladderFor({ ...Object.fromEntries(Object.keys(KEY).map((k) => [k, null])), [stat]: probsOf(p, past)[stat] }, form, data.model)[stat];
      out.set(p.playerId, { lines, vals: form[KEY[stat]] || [] });
    }
    return out;
  }, [data, live, past, date, stat]);
  const lineOpts = useMemo(() => [...new Set([...ladders.values()].flatMap((b) => (b.lines || []).map(([T]) => T)))].sort((a, b) => a - b), [ladders]);
  const store = `slapshot.band.${stat}`;
  const [labLine, setRaw] = useState(() => { try { const v = localStorage.getItem(store); return v ? Number(v) : null; } catch { return null; } });
  const setLabLine = (v) => { setRaw(v); try { if (v == null) localStorage.removeItem(store); else localStorage.setItem(store, String(v)); } catch { /* this visit only */ } };

  const of = (p) => {
    const b = ladders.get(p.playerId);
    const line = labLine ?? ownLine(b?.lines);
    return { b, line, chance: chanceAt(b?.lines, line) };
  };
  const render = (p) => {
    const { b, line, chance } = of(p);
    if (line == null || !b) return <span style={{ color: "var(--muted)", fontSize: 12 }}>{data === undefined ? "Loading lines…" : "No line board for him tonight"}</span>;
    const w = WORD[stat][line === 1 ? 0 : 1];
    const bet = stat === "G" && line === 1 ? "Anytime Goal Scorer" : `${line}+ ${w}`;
    return (
      <PropBand lineLabel={`${line}+ ${SHORT[stat]}`} line={line} chance={chance} auto={labLine == null}
        onStep={(d) => setLabLine(stepFrom(lineOpts, line, d))} onAuto={() => setLabLine(null)}
        canDown={line > lineOpts[0]} canUp={line < lineOpts[lineOpts.length - 1]}
        rates={[["L5", ...hitsOf(b.vals, line, 5)], ["L10", ...hitsOf(b.vals, line, 10)], ["L20", ...hitsOf(b.vals, line, 20)]]}
        last={b.vals.slice(-5)}
        action={<GamblyButton text={`${p.name}${p.team ? ` (${p.team})` : ""} — ${bet}`} />} />
    );
  };
  return { render, chance: (p) => of(p).chance, labLine, ready: data !== undefined };
}
