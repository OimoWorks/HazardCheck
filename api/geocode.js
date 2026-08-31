import { buildAddressCandidates } from './_lib/normalizeAddress.js';

export const config = { runtime: 'nodejs' };

const GSI_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const FETCH_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function tryGsi(query) {
  const url = `${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const best = data[0];
    const [lon, lat] = best.geometry?.coordinates ?? [];
    if (typeof lon !== 'number' || typeof lat !== 'number') return null;
    return {
      lat,
      lon,
      source: 'gsi',
      matchedTitle: best.properties?.title ?? query,
      addressUsed: query,
    };
  } catch {
    return null;
  }
}

const GOOGLE_PREFERRED_TYPES = ['premise', 'street_address', 'subpremise'];

async function tryGoogle(query, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    query,
  )}&region=jp&language=ja&key=${apiKey}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      return null;
    }
    const results = [...data.results].sort((a, b) => {
      const rank = (types) =>
        Math.min(
          ...types.map((t) => {
            const i = GOOGLE_PREFERRED_TYPES.indexOf(t);
            return i === -1 ? GOOGLE_PREFERRED_TYPES.length : i;
          }),
          GOOGLE_PREFERRED_TYPES.length,
        );
      return rank(a.types ?? []) - rank(b.types ?? []);
    });
    const best = results[0];
    return {
      lat: best.geometry.location.lat,
      lon: best.geometry.location.lng,
      source: 'google',
      matchedTitle: best.formatted_address,
      addressUsed: query,
    };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const address = typeof req.query.address === 'string' ? req.query.address : '';
  if (!address.trim()) {
    res.status(400).json({ error: 'address クエリパラメータが必要です' });
    return;
  }

  const candidates = buildAddressCandidates(address);

  for (const candidate of candidates) {
    const result = await tryGsi(candidate);
    if (result) {
      res.status(200).json(result);
      return;
    }
  }

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleApiKey) {
    for (const candidate of candidates) {
      const result = await tryGoogle(candidate, googleApiKey);
      if (result) {
        res.status(200).json(result);
        return;
      }
    }
  }

  res.status(404).json({
    error: '住所が見つかりませんでした。表記を変えて再入力するか、地図から選択してください。',
    triedCandidates: candidates,
  });
}
