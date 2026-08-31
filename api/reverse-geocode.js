export const config = { runtime: 'nodejs' };

const GSI_REVERSE_ENDPOINT = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';
const FETCH_TIMEOUT_MS = 5000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const lat = Number.parseFloat(req.query.lat);
  const lon = Number.parseFloat(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'lat, lon クエリパラメータが不正です' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `${GSI_REVERSE_ENDPOINT}?lon=${lon}&lat=${lat}`;
    const gsiRes = await fetch(url, { signal: controller.signal });
    if (!gsiRes.ok) throw new Error('gsi reverse geocode failed');
    const data = await gsiRes.json();
    const props = data?.results;
    if (!props || !props.muniCd) throw new Error('no result');

    // GSI逆ジオコーダーは都道府県名を返さないため、本ツールが松山市専用である前提で
    // 「愛媛県松山市」を固定で付与する（muniCd 38201 = 松山市）。
    const address = `愛媛県松山市${props.lv01Nm ?? ''}`;
    res.status(200).json({
      address,
      raw: props,
    });
  } catch {
    // 逆ジオコーディングに失敗した場合は「選択した地点」表示 + 緯度経度のみで
    // フロントエンド側が続行できるよう、addressをnullで返す（エラーにはしない）。
    res.status(200).json({ address: null, raw: null });
  } finally {
    clearTimeout(timeout);
  }
}
