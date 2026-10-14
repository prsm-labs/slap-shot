// Gambly (gambly.com) builds a bet slip at the user's sportsbook from plain text. Its web chat reads ?q= into the
// message box (checked 2026-10-14: /chat?q=... pre-fills the box, nothing is sent until the user sends it), so every
// Gambly button copies the bet text to the clipboard and opens that link. No account / API key / credits on our side.
export const GAMBLY_PROPS = {
  goal: "Anytime Goal Scorer",
  point: "1+ Points",
  sog3: "3+ Shots on Goal",
  first: "First Goal Scorer",
  goal2: "2+ Goals",
  point2: "2+ Points",
};

// "Nathan MacKinnon (COL) — Anytime Goal Scorer"
export const betLine = (p, prop = "goal") => `${p.name}${p.team ? ` (${p.team})` : ""} — ${GAMBLY_PROPS[prop] || prop}`;

// Several lines -> one message; 2+ legs are labelled as a parlay ("same game" when every leg is in one game).
export function betText(lines, { sameGame = false } = {}) {
  if (lines.length < 2) return lines.join("");
  return [...lines, `(${lines.length}-leg ${sameGame ? "same game " : ""}parlay)`].join("\n");
}

export const gamblyUrl = (text) => `https://gambly.com/chat?q=${encodeURIComponent(text)}`;

// My Picks category -> prop. Categories with no prop of their own (Favorite, Dark Horse, Longshot, Hot Hand) send an
// anytime goal.
export const PICK_PROP = { goal: "goal", goal2: "goal2", point: "point", sog: "sog3", first: "first", fav: "goal", dark: "goal", long: "goal", hot: "goal" };
