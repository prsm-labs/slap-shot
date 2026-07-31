import { useState } from "react";
import { CCY_SYM, parseOdds, riskDesc, parlayDecimal } from "../lib/odds.js";

const inputStyle = {
  background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)",
  borderRadius: 6, padding: "7px 9px", fontFamily: "'DM Mono',monospace", fontSize: 12, width: "100%",
};

export default function OddsCalculatorTab() {
  const [oddsRaw, setOddsRaw] = useState("");
  const [bankroll, setBankroll] = useState("");
  const [unitSize, setUnitSize] = useState("");
  const [unitRate, setUnitRate] = useState(3);
  const [currency, setCurrency] = useState("USD");
  const [legs, setLegs] = useState(["", ""]);

  const parsed = parseOdds(oddsRaw);
  const sym = CCY_SYM[currency] || "$";
  const rate = (parseFloat(unitRate) || 3) / 100;

  function handleBankroll(v) {
    setBankroll(v);
    const b = parseFloat(v);
    setUnitSize(!isNaN(b) && b > 0 ? (b * rate).toFixed(2) : "");
  }
  function handleUnitSize(v) {
    setUnitSize(v);
    const u = parseFloat(v);
    setBankroll(!isNaN(u) && u > 0 ? (u / rate).toFixed(2) : "");
  }

  const canCalc = !!(parsed && parsed.decimal > 1 && parseFloat(unitSize) > 0);
  let result = null;
  if (canCalc) {
    const unitFrac = 1 / (parsed.decimal - 1);
    const estStake = Math.max(unitFrac * parseFloat(unitSize), 0.1);
    const potReturn = estStake * parsed.decimal;
    result = {
      estStake, potReturn, profit: potReturn - estStake,
      impliedProb: (1 / parsed.decimal) * 100, desc: riskDesc(unitFrac),
    };
  }

  const legOdds = legs.map(parseOdds);
  const allLegsValid = legs.length >= 2 && legOdds.every((p) => p && p.decimal > 1);
  const parlayDec = allLegsValid ? parlayDecimal(legOdds) : null;
  const parlayStake = parseFloat(unitSize) || 0;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🧮 Odds Calculator</div>
        <div className="section-sub">Direct port of Going Yard's real odds/bankroll math — zero sport-specific logic</div>
      </div>

      <div className="grid-cards">
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Bankroll / Unit</div>
          <FieldRow label="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
              {Object.keys(CCY_SYM).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Unit % of bankroll">
            <input style={inputStyle} value={unitRate} onChange={(e) => setUnitRate(e.target.value)} />
          </FieldRow>
          <FieldRow label="Bankroll">
            <input style={inputStyle} value={bankroll} onChange={(e) => handleBankroll(e.target.value)} placeholder="1000" />
          </FieldRow>
          <FieldRow label="Unit size">
            <input style={inputStyle} value={unitSize} onChange={(e) => handleUnitSize(e.target.value)} placeholder="30" />
          </FieldRow>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Single Bet</div>
          <FieldRow label="Odds (american, decimal, or +/-)">
            <input style={inputStyle} value={oddsRaw} onChange={(e) => setOddsRaw(e.target.value)} placeholder="-150 or 2.50" />
          </FieldRow>
          {result && (
            <div className="mono" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.8 }}>
              <div>Suggested stake: <b>{sym}{result.estStake.toFixed(2)}</b> ({result.desc})</div>
              <div>Potential return: <b>{sym}{result.potReturn.toFixed(2)}</b></div>
              <div>Profit if hits: <b>{sym}{result.profit.toFixed(2)}</b></div>
              <div>Implied probability: <b>{result.impliedProb.toFixed(1)}%</b></div>
            </div>
          )}
          {!canCalc && oddsRaw && <div className="mono" style={{ fontSize: 11, color: "var(--red)", marginTop: 8 }}>Enter valid odds + a unit size above.</div>}
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Parlay ({legs.length} legs)</div>
          {legs.map((v, i) => (
            <FieldRow key={i} label={`Leg ${i + 1}`}>
              <input style={inputStyle} value={v} onChange={(e) => {
                const next = [...legs]; next[i] = e.target.value; setLegs(next);
              }} placeholder="-110" />
            </FieldRow>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="btn" onClick={() => setLegs([...legs, ""])}>+ Add Leg</button>
            {legs.length > 2 && <button className="btn" onClick={() => setLegs(legs.slice(0, -1))}>− Remove Leg</button>}
          </div>
          {parlayDec && (
            <div className="mono" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.8 }}>
              <div>Combined decimal odds: <b>{parlayDec.toFixed(2)}</b></div>
              <div>Potential return on {sym}{parlayStake || 0} stake: <b>{sym}{(parlayStake * parlayDec).toFixed(2)}</b></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <label className="mono" style={{ fontSize: 10, color: "var(--muted)", display: "block", marginBottom: 8 }}>
      {label}
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  );
}
