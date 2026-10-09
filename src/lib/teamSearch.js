// Search helper shared by every search bar: matches player names AND teams by abbreviation ("TOR"),
// city ("Toronto"), team name ("Maple Leafs") or common nickname ("Leafs", "Habs", "Bolts").
// Multi-word queries must match every word somewhere ("leafs matthews", "new york rangers").
// A query that is exactly a team abbreviation or alternate code ("TOR", "LA", "NJ") matches that team
// (or a player whose first / last name starts with it) — so "tor" doesn't also pull in every "Victor".
const TEAMS = {
  ANA: ["Anaheim", "Ducks"],
  BOS: ["Boston", "Bruins", "Bs"],
  BUF: ["Buffalo", "Sabres"],
  CGY: ["Calgary", "Flames"],
  CAR: ["Carolina", "Hurricanes", "Canes"],
  CHI: ["Chicago", "Blackhawks", "Hawks"],
  COL: ["Colorado", "Avalanche", "Avs"],
  CBJ: ["Columbus", "Blue Jackets", "Jackets", "CLB"],
  DAL: ["Dallas", "Stars"],
  DET: ["Detroit", "Red Wings", "Wings"],
  EDM: ["Edmonton", "Oilers"],
  FLA: ["Florida", "Panthers", "Cats", "FLO"],
  LAK: ["Los Angeles", "Kings", "LA"],
  MIN: ["Minnesota", "Wild"],
  MTL: ["Montreal", "Montréal", "Canadiens", "Habs"],
  NSH: ["Nashville", "Predators", "Preds"],
  NJD: ["New Jersey", "Devils", "NJ"],
  NYI: ["New York", "Islanders", "Isles"],
  NYR: ["New York", "Rangers", "Blueshirts"],
  OTT: ["Ottawa", "Senators", "Sens"],
  PHI: ["Philadelphia", "Flyers", "Philly"],
  PIT: ["Pittsburgh", "Penguins", "Pens"],
  SJS: ["San Jose", "Sharks", "SJ"],
  SEA: ["Seattle", "Kraken"],
  STL: ["St. Louis", "St Louis", "Saint Louis", "Blues"],
  TBL: ["Tampa Bay", "Tampa", "Lightning", "Bolts", "TB"],
  TOR: ["Toronto", "Maple Leafs", "Leafs"],
  UTA: ["Utah", "Mammoth", "Utah Hockey Club", "UTAH"],
  VAN: ["Vancouver", "Canucks", "Nucks"],
  VGK: ["Vegas", "Las Vegas", "Golden Knights", "Knights", "VEG"],
  WSH: ["Washington", "Capitals", "Caps", "WAS"],
  WPG: ["Winnipeg", "Jets"],
  ARI: ["Arizona", "Coyotes", "Yotes"],
};

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "");
const TEAM_TEXT = Object.fromEntries(Object.entries(TEAMS).map(([abbr, names]) => [abbr, norm([abbr, ...names].join(" "))]));
// exact codes -> team (abbreviations plus short alternates like LA, NJ, TB)
const CODES = new Map();
for (const [abbr, names] of Object.entries(TEAMS)) {
  CODES.set(abbr.toLowerCase(), abbr);
  for (const n of names) if (/^[A-Z]{2,4}$/.test(n)) CODES.set(n.toLowerCase(), abbr);
}

export function teamText(abbr) {
  return TEAM_TEXT[abbr] || norm(abbr);
}

// query: what was typed; names: player name(s) on the row; teams: team abbreviation(s) on the row.
export function matchesSearch(query, names = [], teams = []) {
  const q = norm(query).trim();
  if (!q) return true;
  const code = CODES.get(q);
  // ...plus names with a word starting with it, so typing "Cole" doesn't blank out at "col"
  if (code) return teams.includes(code) || names.some((n) => norm(n).split(/[\s-]+/).some((w) => w.startsWith(q)));
  const hay = [...names.map(norm), ...teams.filter(Boolean).map(teamText)].join(" | ");
  return q.split(/\s+/).every((w) => hay.includes(w));
}
