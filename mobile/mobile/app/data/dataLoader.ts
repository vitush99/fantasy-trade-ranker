const BASE_URL = 'https://storage.googleapis.com/fantasy-trade-ranker';

export async function fetchRankings(format: 'sf' | '1qb') {
  const file = format === 'sf' ? 'ktc_rankings_sf.json' : 'ktc_rankings_1qb.json';
  const res = await fetch(`${BASE_URL}/${file}`);
  if (!res.ok) throw new Error(`Failed to fetch rankings: ${res.status}`);
  return await res.json();
}

export async function fetchTrades() {
  const res = await fetch(`${BASE_URL}/ktc_trades.json`);
  if (!res.ok) throw new Error(`Failed to fetch trades: ${res.status}`);
  return await res.json();
}
