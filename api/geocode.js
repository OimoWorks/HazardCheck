import { buildAddressCandidates } from './_lib/normalizeAddress.js';
import { isBanchiMismatch } from './_lib/addressMatch.js';

export const config = { runtime: 'nodejs' };

const GSI_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const FETCH_TIMEOUT_MS = 5000;

// 一時的なデバッグログ（GEOCODE_DEBUG=1 のときのみ有効）。
// GSI・Googleそれぞれが実際に何を返し、どの候補が番地不一致で却下されたかを
// 調査するために追加。原因調査が終わったら削除して構わない。
const DEBUG = process.env.GEOCODE_DEBUG === '1';
function debugLog(source, query, payload) {
  if (!DEBUG) return;
  console.log(`[geocode-debug][${source}] query=${JSON.stringify(query)}`, JSON.stringify(payload));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GSI住所検索APIを呼び出す。返ってきた候補を先頭から順に見て、
 * 検索文字列と番地が一致する最初の候補を採用する（番地が食い違う候補は
 * 字名だけの粗い一致とみなして飛ばす）。
 */
export async function tryGsi(query) {
  const url = `${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      debugLog('gsi', query, { httpStatus: res.status });
      return null;
    }
    const data = await res.json();
    debugLog('gsi', query, { rawCount: Array.isArray(data) ? data.length : 0, raw: data });
    if (!Array.isArray(data) || data.length === 0) return null;

    for (const candidate of data) {
      const [lon, lat] = candidate.geometry?.coordinates ?? [];
      const title = candidate.properties?.title ?? '';
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;

      if (isBanchiMismatch(query, title)) {
        debugLog('gsi', query, { rejected: title, reason: '検索した番地と結果の番地が一致しない' });
        continue;
      }

      return {
        lat,
        lon,
        source: 'gsi',
        matchedTitle: title || query,
        addressUsed: query,
      };
    }
    debugLog('gsi', query, { result: 'すべての候補が番地不一致のため却下' });
    return null;
  } catch (err) {
    debugLog('gsi', query, { error: String(err) });
    return null;
  }
}

const GOOGLE_PREFERRED_TYPES = ['premise', 'street_address', 'subpremise'];

/**
 * Google Geocoding APIを呼び出す。`types` による優先順位付けだけでなく、
 * 検索文字列と番地が一致する候補のみを採用する。Googleは番地が正確に
 * ジオコーディングできない場合でも、近傍の別施設（学校等）の住所に
 * フォールバックした結果を高い確度で返すことがあるため、
 * この番地一致チェックが特に重要になる。
 */
export async function tryGoogle(query, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    query,
  )}&region=jp&language=ja&key=${apiKey}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      debugLog('google', query, { httpStatus: res.status });
      return null;
    }
    const data = await res.json();
    debugLog('google', query, {
      status: data.status,
      resultCount: Array.isArray(data.results) ? data.results.length : 0,
      raw: data.results,
    });
    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      return null;
    }
    const sorted = [...data.results].sort((a, b) => {
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

    for (const candidate of sorted) {
      if (isBanchiMismatch(query, candidate.formatted_address)) {
        debugLog('google', query, {
          rejected: candidate.formatted_address,
          reason: '検索した番地と結果の番地が一致しない',
          partial_match: candidate.partial_match ?? false,
        });
        continue;
      }
      return {
        lat: candidate.geometry.location.lat,
        lon: candidate.geometry.location.lng,
        source: 'google',
        matchedTitle: candidate.formatted_address,
        addressUsed: query,
      };
    }
    debugLog('google', query, { result: 'すべての候補が番地不一致のため却下' });
    return null;
  } catch (err) {
    debugLog('google', query, { error: String(err) });
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
  debugLog('normalize', address, { candidates });

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
