// api/promo.js — is DraftKings' NHL "Ice Breaker" promo running tonight?
//
// The promo isn't nightly (mostly Thursdays, plus specials like Stanley Cup Final Game 1). DraftKings' own news site
// (DK Network, dknetwork.draftkings.com — public WordPress JSON, no key) posts an Ice Breaker article on each promo
// day ("Why X will be the NHL Ice Breaker on Thursday, March 26", "... results ... on Friday, October 9"). A post
// dated tonight's slate date, or whose title names it, = live. The same posts quote past payouts ("63 bettors ...
// $3,969 in Bonus Bets", "could've been ... $2,381"), returned as `history`.
//
//   GET /api/promo?date=YYYY-MM-DD
//   -> { date, status, live, likely, pool, startHourEt, singleGame, source: {title, link, date} | null, history: [...] }
// status: "confirmed" (a DK Network post for tonight) | "likely" (no post yet, but it's a Thursday — the promo's
// regular night; DK Network often posts during the evening) | "off". The page also lets a viewer switch it on.
// Cached 30 min at the edge (one DK Network call per half hour, however many people open the page).

const WP = "https://dknetwork.draftkings.com/wp-json/wp/v2/posts";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const plain = (html) => String(html || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, "-").replace(/&#8212;|&mdash;/g, "-")
  .replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();
const num = (s) => (s == null ? null : WORDS[String(s).toLowerCase()] ?? Number(String(s).replace(/,/g, "")));

// "on Thursday, March 26" in a title -> matches the slate date (month + day)?
function titleNamesDate(title, date) {
  const m = title.toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december) (\d{1,2})/);
  if (!m) return false;
  const [, mo, d] = date.split("-").map(Number);
  return MONTHS.indexOf(m[1]) + 1 === mo && Number(m[2]) === d;
}

// Past payouts quoted in the posts. Winner lines carry bettors + payout; "could've been" lines payout only.
function payouts(text, postDate) {
  const out = [];
  const win = /([A-Z][\w.'-]+(?: [A-Z][\w.'-]+){1,2}) was (?:the most recent|last week's|last night's|last week’s|last night’s) (?:NHL )?Ice Breaker, with (?:just |only )?([\d,]+|[a-z]+) DraftKings Sportsbook (?:bettors|users|customers) receiving (?:a |an )?(?:whopping )?\$([\d,]+)/g;
  for (const m of text.matchAll(win)) out.push({ name: m[1], bettors: num(m[2]), payout: num(m[3]), kind: "winner", post: postDate });
  const could = /🥅 ([A-Z][\w.'-]+(?: [A-Z][\w.'-]+){1,2}) [-–] \$([\d,]+)/g;
  for (const m of text.matchAll(could)) out.push({ name: m[1], bettors: null, payout: num(m[2]), kind: "could have", post: postDate });
  return out;
}

export async function promoStatus(date) {
  const url = `${WP}?search=${encodeURIComponent('"ice breaker"')}&per_page=50&orderby=date&_fields=date,title,link,content`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`DK Network -> ${res.status}`);
  const posts = (await res.json())
    .map((p) => ({ date: p.date, title: plain(p.title?.rendered), link: p.link, text: plain(p.content?.rendered) }))
    .filter((p) => /ice ?breaker/i.test(p.title) || /ice ?breaker/i.test(p.text.slice(0, 600)));
  const today = posts.find((p) => p.date?.slice(0, 10) === date || titleNamesDate(p.title, date)) || null;
  let pool = null, startHourEt = 19, singleGame = false;
  if (today) {
    const pm = today.text.match(/share of \$([\d,]+)/i) || today.text.match(/\$([\d,]+) (?:in )?bonus bets/i);
    pool = pm ? num(pm[1]) : 250000;
    const sm = today.text.match(/(\d{1,2})(?::(\d\d))? ?p\.? ?m\.? ET slate/i);
    if (sm) startHourEt = 12 + Number(sm[1]) + (sm[2] ? Number(sm[2]) / 60 : 0);
    singleGame = /first goal of the game/i.test(today.text) && !/slate/i.test(today.text);
  }
  const seen = new Set();
  const history = posts.flatMap((p) => payouts(p.text, p.date?.slice(0, 10)))
    .filter((h) => {
      const k = `${h.name}|${h.payout}`;
      if (seen.has(k) || !(h.payout > 0)) return false;
      seen.add(k);
      return true;
    });
  const thursday = new Date(`${date}T12:00:00Z`).getUTCDay() === 4;
  const status = today ? "confirmed" : thursday ? "likely" : "off";
  return {
    date, status, live: Boolean(today), likely: !today && thursday, pool, startHourEt, singleGame,
    source: today ? { title: today.title, link: today.link, date: today.date } : null,
    checkedAt: new Date().toISOString(), history,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const date = String(req.query?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date=YYYY-MM-DD required" });
  try {
    const data = await promoStatus(date);
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=1800");
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
