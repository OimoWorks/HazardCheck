import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import floodL1 from '../../data/processed/flood-l1.json';
import floodL2 from '../../data/processed/flood-l2.json';
import sediment from '../../data/processed/sediment.json';
import shelters from '../../data/processed/shelters.json';
import meta from '../../data/processed/meta.json';
import { haversineDistanceMeters } from './haversine.js';

export const dataMeta = meta;

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
export function lookupFlood(lon, lat) {
  return [
    {
      key: 'flood_l1',
      label: '計画規模（L1）',
      ...matchFloodL1(lon, lat),
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

function matchFloodL1(lon, lat) {
  const feature = findMatchingFeature(floodL1, lon, lat);
  if (feature) return { hit: true, rank: feature.properties?.rank ?? '不明' };

  // coverage（L1データを持つ河川の流域の近似範囲）が無い場合は判定不能なので、
  // 従来どおり「区域外」のみを返す（誤って「データなし」を大量表示しないための保険）。
  if (!floodL1.coverage) return { hit: false, rank: '区域外' };

  const withinCoverage = isWithinFeature(floodL1.coverage, lon, lat);
  if (withinCoverage) return { hit: false, rank: '区域外' };
  return { hit: false, rank: FLOOD_L1_NO_DATA_RANK, noData: true };
}

/**
 * 土砂災害警戒区域（急傾斜地の崩壊・土石流・地すべり）を判定する。
 * @returns {{ hit: boolean, types: string[] }}
 */
export function lookupSediment(lon, lat) {
  const pt = point([lon, lat]);
  const matched = (sediment.features || []).filter((f) => {
    try {
      return booleanPointInPolygon(pt, f);
    } catch {
      return false;
    }
  });
  const types = [...new Set(matched.map((f) => f.properties?.type).filter(Boolean))];
  return { hit: types.length > 0, types };
}

/**
 * 最寄りの指定避難所を1件返す。
 * @returns {{ name: string, lat: number, lng: number, distanceMeters: number, disasterTypes: string[] } | null}
 */
export function findNearestShelter(lon, lat) {
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

export function diagnose(lon, lat) {
  const flood = lookupFlood(lon, lat);
  const sedimentResult = lookupSediment(lon, lat);
  const nearestShelter = findNearestShelter(lon, lat);
  const placeholderByCategory = meta?.placeholder || {};
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
