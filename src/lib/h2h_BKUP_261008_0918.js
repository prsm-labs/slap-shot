// Head-to-head history for tonight's slate (public/data/h2h_today.json, built nightly by
// build_h2h.py from MoneyPuck game-by-game + shot files since 2022-23). History only — not used
// in any score.
import { useEffect, useState } from "react";

let cache = null;
function fetchH2H() {
  if (!cache) {
    cache = fetch("/data/h2h_today.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cache;
}

export function useH2H() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchH2H().then((d) => alive && setData(d));
    return () => { alive = false; };
  }, []);
  return data;
}

// "2025" (MoneyPuck season start year) -> 20252026, the NHL season id the charts label with.
export const nhlSeason = (s) => Number(`${s}${s + 1}`);
