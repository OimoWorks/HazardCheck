#!/usr/bin/env node
// data/raw/ に配置された生データ（Shapefile または GeoJSON）を読み込み、
// 松山市域に絞り込んだ軽量な data/processed/*.json を生成するバッチスクリプト。
//
// 使い方: npm run build:hazard-data
//
// data/raw/<各ソース>/ に実データが見つからない場合は、動作確認用の
// ダミーGeoJSON（scripts/fixtures/）を代わりに使用し、生成物に
// placeholder フラグを付与する。実データを配置した後に再実行すること。
//
// ⚠️ 属性列名について:
// 国土数値情報のデータは年度・形式によって属性（列）名が異なることがある。
// このスクリプトは代表的な列名候補（*_FIELD_CANDIDATES）とキーワードの部分一致で
// 属性を解決しようとするが、実データで解決できなかった場合は各ソースの
// README（data/raw/*/README.md）の案内に従い、このファイル内の候補配列に
// 実際の列名を追記すること。実行時にコンソールへ検出した属性キー一覧を出力するので
// それを参考にする。

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as shapefile from 'shapefile';
import * as turf from '@turf/turf';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_DIR = join(ROOT, 'data', 'raw');
const PROCESSED_DIR = join(ROOT, 'data', 'processed');
const FIXTURES_DIR = join(__dirname, 'fixtures');

const FLOOD_RANK_FIELD_CANDIDATES = [
  '浸水ランク',
  '浸水深ランク',
  'A31a_201',
  'A31b_201',
  'A31a_101',
  'A31b_101',
  'rank',
  'RANK',
];

// 想定浸水深ランクのコード→表示ラベル対応（要検証。実データがコード値の場合のみ使用）。
const FLOOD_RANK_CODE_MAP = {
  1: '0.5m未満',
  2: '0.5m以上3.0m未満',
  3: '3.0m以上5.0m未満',
  4: '5.0m以上10.0m未満',
  5: '10.0m以上20.0m未満',
  6: '20.0m以上',
};

const SEDIMENT_TYPE_KEYWORDS = {
  急傾斜地の崩壊: ['急傾斜'],
  土石流: ['土石流'],
  地すべり: ['地すべり', '地滑り'],
};

const SEDIMENT_ZONE_FIELD_CANDIDATES = ['区域区分', '警戒区域区分', 'AREA_TYPE'];

const SHELTER_NAME_FIELD_CANDIDATES = [
  '施設名称',
  '名称',
  'name',
  'NAME01',
  'P20_002',
];

const DISASTER_TYPE_KEYWORDS = [
  '洪水',
  '崖崩れ',
  '土石流',
  '地滑り',
  '地すべり',
  '高潮',
  '地震',
  '津波',
  '大規模な火事',
  '内水氾濫',
  '火山現象',
];

const TRUTHY_VALUES = new Set(['1', 1, true, 'true', '○', 'あり', 'TRUE']);

function listDataFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => !f.toLowerCase().startsWith('readme'));
}

async function readShapefileFeatures(shpPath, dbfPath) {
  const features = [];
  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'shift_jis' });
  let result = await source.read();
  while (!result.done) {
    features.push(result.value);
    result = await source.read();
  }
  return features;
}

async function loadFeaturesFromDir(dir, fixtureFile, sourceLabel) {
  const files = listDataFiles(dir);
  const shp = files.find((f) => extname(f).toLowerCase() === '.shp');
  const geojson = files.find((f) => ['.geojson', '.json'].includes(extname(f).toLowerCase()));

  if (shp) {
    const base = shp.slice(0, -4);
    const dbf = files.find((f) => f.toLowerCase() === `${base.toLowerCase()}.dbf`);
    if (!dbf) {
      console.warn(`[${sourceLabel}] .shp はあるが対応する .dbf が見つからないためスキップ`);
    } else {
      console.log(`[${sourceLabel}] Shapefile を読み込み: ${shp}`);
      const features = await readShapefileFeatures(join(dir, shp), join(dir, dbf));
      return { features, placeholder: false };
    }
  }

  if (geojson) {
    console.log(`[${sourceLabel}] GeoJSON を読み込み: ${geojson}`);
    const raw = JSON.parse(readFileSync(join(dir, geojson), 'utf-8'));
    const features = raw.type === 'FeatureCollection' ? raw.features : [raw];
    return { features, placeholder: false };
  }

  console.warn(
    `[${sourceLabel}] data/raw/ に実データが見つからないため、動作確認用のダミーデータを使用します（本番公開前に実データを配置して再実行してください）`,
  );
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, fixtureFile), 'utf-8'));
  return { features: raw.features, placeholder: true };
}

function logPropertyKeys(sourceLabel, features) {
  const keys = new Set();
  for (const f of features.slice(0, 20)) {
    Object.keys(f.properties || {}).forEach((k) => keys.add(k));
  }
  console.log(`[${sourceLabel}] 検出された属性キー: ${[...keys].join(', ') || '(なし)'}`);
}

function resolveFloodRank(properties) {
  for (const key of FLOOD_RANK_FIELD_CANDIDATES) {
    if (key in properties && properties[key] !== null && properties[key] !== '') {
      const raw = properties[key];
      const str = String(raw);
      if (/m未満|m以上/.test(str)) return str;
      if (FLOOD_RANK_CODE_MAP[raw]) return FLOOD_RANK_CODE_MAP[raw];
      return str;
    }
  }
  return '不明';
}

function resolveSedimentZone(properties) {
  for (const key of SEDIMENT_ZONE_FIELD_CANDIDATES) {
    if (key in properties && properties[key]) return String(properties[key]);
  }
  return null;
}

function detectSedimentTypeFromProperties(properties) {
  const values = Object.values(properties || {}).map((v) => String(v ?? ''));
  for (const [type, keywords] of Object.entries(SEDIMENT_TYPE_KEYWORDS)) {
    if (values.some((v) => keywords.some((kw) => v.includes(kw)))) return type;
  }
  return null;
}

function resolveShelterName(properties) {
  for (const key of SHELTER_NAME_FIELD_CANDIDATES) {
    if (key in properties && properties[key]) return String(properties[key]);
  }
  return '名称不明の避難所';
}

function resolveDisasterTypes(properties) {
  const types = [];
  for (const [key, value] of Object.entries(properties || {})) {
    const matchedKeyword = DISASTER_TYPE_KEYWORDS.find((kw) => key.includes(kw));
    if (matchedKeyword && TRUTHY_VALUES.has(value)) {
      if (!types.includes(matchedKeyword)) types.push(matchedKeyword);
    }
  }
  return types;
}

function boundaryFeatures(rawFeatures) {
  const nameFieldCandidates = ['N03_004', 'CITY_NAME', '市区町村名', 'city'];
  const named = rawFeatures.filter((f) =>
    nameFieldCandidates.some((key) => f.properties && String(f.properties[key] ?? '').includes('松山市')),
  );
  return named.length > 0 ? named : rawFeatures;
}

function intersectsBoundary(feature, boundary) {
  try {
    return boundary.some((b) => turf.booleanIntersects(feature, b));
  } catch {
    return false;
  }
}

function pointInBoundary(feature, boundary) {
  try {
    return boundary.some((b) => {
      const geom = b.geometry;
      if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
        return turf.booleanPointInPolygon(feature, b);
      }
      return false;
    });
  } catch {
    return false;
  }
}

function simplifyGeometry(feature) {
  try {
    return turf.simplify(feature, { tolerance: 0.0002, highQuality: false });
  } catch {
    return feature;
  }
}

async function main() {
  mkdirSync(PROCESSED_DIR, { recursive: true });

  let anyPlaceholder = false;

  const boundaryLoad = await loadFeaturesFromDir(
    join(RAW_DIR, 'matsuyama-boundary'),
    'matsuyama-boundary.geojson',
    'matsuyama-boundary',
  );
  anyPlaceholder ||= boundaryLoad.placeholder;
  const boundary = boundaryFeatures(boundaryLoad.features);
  console.log(`松山市境界: ${boundary.length} 地物`);

  // --- 洪水浸水想定区域 ---
  const floodSources = [
    { dir: 'flood-l1', fixture: 'flood-l1.geojson', out: 'flood-l1.json', label: 'flood-l1' },
    { dir: 'flood-l2', fixture: 'flood-l2.geojson', out: 'flood-l2.json', label: 'flood-l2' },
  ];

  for (const src of floodSources) {
    const { features, placeholder } = await loadFeaturesFromDir(
      join(RAW_DIR, src.dir),
      src.fixture,
      src.label,
    );
    anyPlaceholder ||= placeholder;
    logPropertyKeys(src.label, features);

    const inBoundary = features.filter((f) => intersectsBoundary(f, boundary));
    const out = inBoundary.map((f) =>
      simplifyGeometry({
        type: 'Feature',
        properties: { rank: resolveFloodRank(f.properties || {}) },
        geometry: f.geometry,
      }),
    );

    writeFileSync(
      join(PROCESSED_DIR, src.out),
      JSON.stringify(
        {
          type: 'FeatureCollection',
          placeholder,
          generatedAt: new Date().toISOString(),
          features: out,
        },
        null,
        placeholder ? 2 : 0,
      ),
    );
    console.log(`[${src.label}] -> ${src.out} (${out.length} 地物, placeholder=${placeholder})`);
  }

  // --- 土砂災害警戒区域 ---
  const sedimentSources = [
    { dir: 'sediment-steep', fixture: 'sediment-steep.geojson', defaultType: '急傾斜地の崩壊' },
    { dir: 'sediment-debris', fixture: 'sediment-debris.geojson', defaultType: '土石流' },
    { dir: 'sediment-landslide', fixture: 'sediment-landslide.geojson', defaultType: '地すべり' },
  ];

  const sedimentFeatures = [];
  for (const src of sedimentSources) {
    const { features, placeholder } = await loadFeaturesFromDir(
      join(RAW_DIR, src.dir),
      src.fixture,
      src.dir,
    );
    if (features.length === 0) continue;
    anyPlaceholder ||= placeholder;
    logPropertyKeys(src.dir, features);

    const inBoundary = features.filter((f) => intersectsBoundary(f, boundary));
    for (const f of inBoundary) {
      const type = detectSedimentTypeFromProperties(f.properties || {}) || src.defaultType;
      sedimentFeatures.push(
        simplifyGeometry({
          type: 'Feature',
          properties: { type, zone: resolveSedimentZone(f.properties || {}) },
          geometry: f.geometry,
        }),
      );
    }
  }

  writeFileSync(
    join(PROCESSED_DIR, 'sediment.json'),
    JSON.stringify(
      {
        type: 'FeatureCollection',
        placeholder: anyPlaceholder,
        generatedAt: new Date().toISOString(),
        features: sedimentFeatures,
      },
      null,
      2,
    ),
  );
  console.log(`[sediment] -> sediment.json (${sedimentFeatures.length} 地物)`);

  // --- 指定緊急避難場所 ---
  const shelterLoad = await loadFeaturesFromDir(
    join(RAW_DIR, 'shelters'),
    'shelters.geojson',
    'shelters',
  );
  anyPlaceholder ||= shelterLoad.placeholder;
  logPropertyKeys('shelters', shelterLoad.features);

  const shelters = shelterLoad.features
    .filter((f) => f.geometry && f.geometry.type === 'Point')
    .filter((f) => pointInBoundary(f, boundary))
    .map((f) => ({
      name: resolveShelterName(f.properties || {}),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      disasterTypes: resolveDisasterTypes(f.properties || {}),
    }));

  writeFileSync(join(PROCESSED_DIR, 'shelters.json'), JSON.stringify(shelters, null, 2));
  console.log(`[shelters] -> shelters.json (${shelters.length} 件)`);

  writeFileSync(
    join(PROCESSED_DIR, 'meta.json'),
    JSON.stringify(
      {
        placeholder: anyPlaceholder,
        generatedAt: new Date().toISOString(),
        note: anyPlaceholder
          ? '一部またはすべてのデータがダミー（動作確認用）です。data/raw/ に実データを配置して npm run build:hazard-data を再実行してください。'
          : '実データから生成されました。',
      },
      null,
      2,
    ),
  );

  if (anyPlaceholder) {
    console.warn(
      '\n⚠️ 一部のデータソースでダミーデータが使用されました。本番公開前に data/raw/ に実データを配置し、再度 npm run build:hazard-data を実行してください。\n',
    );
  } else {
    console.log('\n✅ すべてのソースで実データが使用されました。');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
