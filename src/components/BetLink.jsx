import { BET_STATES, BOOK_NAMES, betUrl, fmtAmerican, setBetState, useBetState } from "../lib/bookOdds.js";

// Tap-to-bet pieces (lib/bookOdds.js). Every link opens the sportsbook in a new tab / its app; clicks never reach
// The Odds API, so they cost nothing.
const stop = (e) => e.stopPropagation(); // rows / cards underneath open slideouts

export function BetAnchor({ link, children, title, style }) {
  if (!link?.url) return <span style={style} title={link?.needsState ? "Pick your state (📍) to open this book" : title}>{children}</span>;
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={stop} title={title}
      style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: 2, ...style }}>
      {children}<span style={{ fontSize: "0.8em", marginLeft: 2 }}>↗</span>
    </a>
  );
}

// Best price, tappable: "+140 MGM ↗".
export function BestPriceLink({ book, children }) {
  useBetState();
  if (!book) return children ?? "—";
  const link = betUrl(book, book.bestBook);
  return (
    <BetAnchor link={link} title={`Add to your ${BOOK_NAMES[book.bestBook] || book.bestBook} bet slip`}>
      {children ?? <>{fmtAmerican(book.best)} <span style={{ color: "var(--muted)", fontSize: 10 }}>{book.bestBook}</span></>}
    </BetAnchor>
  );
}

// Every book's price, each tappable: "DK +125 ↗ · FD +135 ↗ · ...".
export function AllBookLinks({ book }) {
  useBetState();
  if (!book) return <span>No sportsbook price</span>;
  const entries = Object.entries(book.books).sort((a, b) => b[1] - a[1]);
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "2px 10px" }}>
      {entries.map(([bk, am]) => (
        <BetAnchor key={bk} link={betUrl(book, bk)} title={`Add to your ${BOOK_NAMES[bk] || bk} bet slip`}
          style={{ fontWeight: bk === book.bestBook ? 700 : 400, whiteSpace: "nowrap" }}>
          {bk} {fmtAmerican(am)}
        </BetAnchor>
      ))}
    </span>
  );
}

// 📍 state for BetMGM / BetRivers links (saved on this device).
export function StatePicker() {
  const state = useBetState();
  return (
    <label className="mono" onClick={stop} title="Your state — BetMGM and BetRivers links open that state's site. Saved on this device."
      style={{ fontSize: 10, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
      📍
      <select value={state} onChange={(e) => setBetState(e.target.value)}
        style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10, padding: "2px 4px" }}>
        <option value="">State</option>
        {BET_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
  );
}
