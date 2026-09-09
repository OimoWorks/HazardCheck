import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { haversineDistanceMeters } from './haversine.js';

// data/processed/*.json は避難所(829件)・土砂災害警戒区域(3,000件超)を含み合計で
// 1MB超になるため、静的importでJSバンドルに焼き込まず、診断が実際に必要になった
// タイミングで動的importする（Viteが別チャンクとして分割し、初期表示を軽く保つ）。
let dataPromise = null;
function loadData() {
  if (!dataPromise) {
    dataPromise = Promise.all([
      import('../../data/processed/flood-l1.json'),
      import('../../data/processed/flood-l2.json'),
      import('../../data/processed/sediment.json'),
      import('../../data/processed/shelters.json'),
      import('../../data/processed/meta.json'),
    ]).then(([floodL1, floodL2, sediment, shelters, meta]) => ({
      floodL1: floodL1.default,
      floodL2: floodL2.default,
      sediment: sediment.default,
      shelters: shelters.default,
      meta: meta.default,
    }));
  }
  return dataPromise;
}

function findMatchingFeature(featureCollection, lon, lat) {
  const pt = point([lon, lat]);
  return (featureCollection.features || []).find((f) => {
    try {
      return booleanPointInPolygon(pt, f);
    } catch {
      return false;
    }
  });
}

function isWithinFeature(feature, lon, lat) {
  if (!feature) return false;
  try {
    return booleanPointInPolygon(point([lon, lat]), feature);
  } catch {
    return false;
  }
}

export const FLOOD_L1_NO_DATA_RANK = 'データなし（この地点は計画規模の指定がない河川の流域です）';

/**
 * 洪水浸水想定（計画規模・想定最大規模）を判定する。
 * 計画規模（L1）は「洪水予報河川・水位周知河川」区分にしか作成されないデータのため、
 * 該当ポリゴンがない場合でも、その河川の流域範囲内（=浸水想定なし）なら「区域外」、
 * 範囲外（=そもそもL1データが存在しない「その他の河川」の流域）なら「データなし」を返す。
 * @returns {{ key: string, label: string, hit: boolean, rank: string, noData?: boolean }[]}
 */
function lookupFlood({ floodL1, floodL2 }, lon, lat) {
  return [
    {
      key: 'flood_l1',
      label: '計画規模（L1）',
      ...matchFloodL1(floodL1, lon, lat),
    },
    {
      key: 'flood_l2',
      label: '想定最大規模（L2）',
      ...matchFlood(floodL2, lon, lat),
    },
  ];
}

function matchFlood(fc, lon, lat) {
  const feature = findMatchingFeature(fc, lon, lat);
  if (!feature) return { hit: false, rank: '区域外' };
  return { hit: true, rank: feature.properties?.rank ?? '不明' };
}

function matchFloodL1(floodL1, lon, lat) {
  const feature = findMatchingFeature(floodL1, lon, lat);
  if (feature) return { hit: true, rank: feature.properties?.rank ?? '不明' };

  // coverage（L1データを持つ河川の流域の近似範囲）が無い場合は判定不能なので、
  // 従来どおり「区域外」のみを返す（誤って「データなし」を大量表示しないための保険）。
  if (!floodL1.coverage) return { hit: false, rank: '区域外' };

  const withinCoverage = isWithinFeature(floodL1.coverage, lon, lat);
  if (withinCoverage) return { hit: false, rank: '区域外' };
  return { hit: false, rank: FLOOD_L1_NO_DATA_RANK, noData: true };
}

// 複数の区域区分（zoneCode）が該当した場合に、表示上どれを代表として使うかの優先順位。
// 指定済み（1・2）を指定前（3・4）より優先し、同じ指定状況内では特別警戒区域を優先する。
const ZONE_TYPE_PRIORITY = [2, 1, 4, 3];

/**
 * 土砂災害警戒区域（急傾斜地の崩壊・土石流・地すべり）を判定する。
 * 該当ポリゴンごとに現象の種類（phenomenonType）と区域区分（zoneType/zoneCode。
 * 1・2=指定済み、3・4=指定前の基礎調査結果で法的な位置づけが異なる）を持つため、
 * 現象の種類は重複を除いて列挙し、区域区分は ZONE_TYPE_PRIORITY に従って
 * 最も優先度の高いものを代表値として返す。
 * @returns {{ hit: boolean, types: string[], zoneType: string | null, zoneCode: number | null }}
 */
function lookupSediment({ sediment }, lon, lat) {
  const pt = point([lon, lat]);
  const matched = (sediment.features || []).filter((f) => {
    try {
      return booleanPointInPolygon(pt, f);
    } catch {
      return false;
    }
  });
  const types = [...new Set(matched.map((f) => f.properties?.phenomenonType).filter(Boolean))];

  let zoneType = null;
  let zoneCode = null;
  for (const code of ZONE_TYPE_PRIORITY) {
    const found = matched.find((f) => f.properties?.zoneCode === code);
    if (found) {
      zoneType = found.properties.zoneType;
      zoneCode = code;
      break;
    }
  }
  if (!zoneType) {
    const fallback = matched.find((f) => f.properties?.zoneType);
    if (fallback) zoneType = fallback.properties.zoneType;
  }

  return { hit: types.length > 0, types, zoneType, zoneCode };
}

/**
 * 最寄りの指定避難所を1件返す。
 * @returns {{ name: string, lat: number, lng: number, distanceMeters: number, disasterTypes: string[] } | null}
 */
function findNearestShelter({ shelters }, lon, lat) {
  if (!Array.isArray(shelters) || shelters.length === 0) return null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const shelter of shelters) {
    const dist = haversineDistanceMeters(lat, lon, shelter.lat, shelter.lng);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = shelter;
    }
  }
  if (!nearest) return null;
  return { ...nearest, distanceMeters: Math.round(nearestDist) };
}

export async function diagnose(lon, lat) {
  const data = await loadData();
  const flood = lookupFlood(data, lon, lat);
  const sedimentResult = lookupSediment(data, lon, lat);
  const nearestShelter = findNearestShelter(data, lon, lat);
  const placeholderByCategory = data.meta?.placeholder || {};
  return {
    flood,
    sediment: sedimentResult,
    nearestShelter,
    floodHit: flood.some((f) => f.hit),
    sedimentHit: sedimentResult.hit,
    placeholder: {
      flood: Boolean(placeholderByCategory['flood-l1'] || placeholderByCategory['flood-l2']),
      sediment: Boolean(placeholderByCategory.sediment),
      shelters: Boolean(placeholderByCategory.shelters),
    },
  };
}
