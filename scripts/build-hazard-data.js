#!/usr/bin/env node
// data/raw/ に配置された生データを読み込み、松山市域に絞り込んだ軽量な
// data/processed/*.json を生成するバッチスクリプト。
//
// 使い方: npm run build:hazard-data
//
// - 洪水浸水想定・土砂災害警戒区域・行政区域境界: 国土数値情報の Shapefile / GeoJSON
// - 避難所: 国土地理院 指定緊急避難場所データポータル（hinanmap.gsi.go.jp）が配布する
//   CSV（指定避難所データ・指定緊急避難場所データ）。詳細は data/raw/shelters/README.md
//
// data/raw/<各ソース>/ に実データが見つからない場合は、動作確認用の
// ダミーデータ（scripts/fixtures/）を代わりに使用し、生成物に
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

// ディレクトリ内の実データ（Shapefile/GeoJSON）を「すべて」読み込んで結合する。
// flood-l2 のように、同じカテゴリに複数ファイル（例: 洪水予報河川・水位周知河川分と
// その他の河川分）を配置する場合があるため、最初の1件だけを使うのではなく
// ディレクトリ内の全ファイルをマージする。
async function loadFeaturesFromDir(dir, fixtureFile, sourceLabel) {
  const files = listDataFiles(dir);
  const shpFiles = files.filter((f) => extname(f).toLowerCase() === '.shp');
  const geojsonFiles = files.filter((f) => ['.geojson', '.json'].includes(extname(f).toLowerCase()));

  let features = [];

  for (const shp of shpFiles) {
    const base = shp.slice(0, -4);
    const dbf = files.find((f) => f.toLowerCase() === `${base.toLowerCase()}.dbf`);
    if (!dbf) {
      console.warn(`[${sourceLabel}] ${shp} に対応する .dbf が見つからないためスキップ`);
      continue;
    }
    console.log(`[${sourceLabel}] Shapefile を読み込み: ${shp}`);
    features = features.concat(await readShapefileFeatures(join(dir, shp), join(dir, dbf)));
  }

  for (const geojson of geojsonFiles) {
    console.log(`[${sourceLabel}] GeoJSON を読み込み: ${geojson}`);
    const raw = JSON.parse(readFileSync(join(dir, geojson), 'utf-8'));
    features = features.concat(raw.type === 'FeatureCollection' ? raw.features : [raw]);
  }

  if (features.length > 0) {
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

// --- 避難所CSV（国土地理院 指定緊急避難場所データポータル配布形式）のパース ---
// 配布CSVは「指定避難所データ」（洪水/地震等の対応フラグを持たない、長期滞在向け）と
// 「指定緊急避難場所データ」（災害種別ごとの対応フラグを持つ）の2種類がある。
// ファイル名（例: 38201_1.csv / 38201_2.csv）ではなく、ヘッダー列の内容で種別を判定する。

const EMERGENCY_SHELTER_DISASTER_COLUMNS = {
  洪水: '洪水',
  '崖崩れ・土石流・地すべり': '崖崩れ、土石流及び地滑り',
  高潮: '高潮',
  地震: '地震',
  津波: '津波',
  大規模な火事: '大規模な火事',
  内水氾濫: '内水氾濫',
  火山現象: '火山現象',
};

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// 簡易CSVパーサ（RFC4180準拠。ダブルクォート囲み・エスケープ・改行入りフィールドに対応）。
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // 改行はLF側で処理するため無視
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function csvToObjects(text) {
  const rows = parseCsv(stripBom(text));
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])));
}

function isTruthyCsvFlag(value) {
  return value === '1' || value === 1;
}

function makePointFeature(lng, lat) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } };
}

/**
 * data/raw/shelters/ 内のCSVファイルを読み込み、避難所レコードの配列を返す。
 * CSVが1件も見つからない場合は null を返す（呼び出し側でダミーにフォールバックする）。
 */
function loadShelterRecordsFromCsvDir(dir) {
  const files = listDataFiles(dir).filter((f) => extname(f).toLowerCase() === '.csv');
  if (files.length === 0) return null;

  const records = [];
  for (const file of files) {
    const objects = csvToObjects(readFileSync(join(dir, file), 'utf-8'));
    if (objects.length === 0) continue;
    const headers = Object.keys(objects[0]);
    const isEmergencyShelterData = headers.includes('洪水') && headers.includes('地震');

    console.log(
      `[shelters] ${file} を読み込み: ${objects.length}件 (${isEmergencyShelterData ? '指定緊急避難場所データ' : '指定避難所データ'})`,
    );

    for (const row of objects) {
      const lat = Number.parseFloat(row['緯度']);
      const lng = Number.parseFloat(row['経度']);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const name = row['施設・場所名'] || '名称不明の避難所';

      if (isEmergencyShelterData) {
        const disasterTypes = Object.entries(EMERGENCY_SHELTER_DISASTER_COLUMNS)
          .filter(([, column]) => isTruthyCsvFlag(row[column]))
          .map(([label]) => label);
        records.push({ name, lat, lng, disasterTypes, category: '指定緊急避難場所' });
      } else {
        records.push({
          name,
          lat,
          lng,
          disasterTypes: [],
          category: '指定避難所',
          acceptedGroups: row['受入対象者'] || undefined,
        });
      }
    }
  }
  return records;
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

// 計画規模（L1）は「洪水予報河川・水位周知河川」区分にしか存在しないデータであり、
// 「その他の河川」区分にはそもそも計画規模のデータ自体が作成されていない。
// そのため、L1ポリゴンが1つも該当しない地点は、
//   (a) 洪水予報河川・水位周知河川の流域内だが浸水想定なし＝「区域外」
//   (b) その他の河川の流域（＝そもそもL1データが存在しない）＝「データなし」
// のどちらかを区別する必要がある。ここでは (a)/(b) を分けるための簡易な近似として、
// L1ポリゴン全体を包む凸包に一定のバッファを加えた範囲を「L1データが存在する河川の
// 流域範囲」とみなす。町丁目境界等の正確な流域データではないため、境界付近では
// 精度に限界がある（本番運用で誤差が問題になる場合は、実際の河川流域界データに
// 差し替えることを検討する）。
const FLOOD_L1_COVERAGE_BUFFER_KM = 1;

function extractCoordinates(geometry) {
  const coords = [];
  const walk = (arr) => {
    if (typeof arr[0] === 'number') {
      coords.push(arr);
      return;
    }
    arr.forEach(walk);
  };
  if (geometry && geometry.coordinates) walk(geometry.coordinates);
  return coords;
}

function computeFloodL1Coverage(features) {
  const points = [];
  for (const f of features) {
    for (const c of extractCoordinates(f.geometry)) {
      points.push(turf.point(c));
    }
  }
  if (points.length < 3) return null;
  try {
    const hull = turf.convex(turf.featureCollection(points));
    if (!hull) return null;
    return turf.buffer(hull, FLOOD_L1_COVERAGE_BUFFER_KM, { units: 'kilometers' });
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(PROCESSED_DIR, { recursive: true });

  const placeholderByCategory = {};

  const boundaryLoad = await loadFeaturesFromDir(
    join(RAW_DIR, 'matsuyama-boundary'),
    'matsuyama-boundary.geojson',
    'matsuyama-boundary',
  );
  const boundaryPlaceholder = boundaryLoad.placeholder;
  const boundary = boundaryFeatures(boundaryLoad.features);
  console.log(`松山市境界: ${boundary.length} 地物`);

  // --- 洪水浸水想定区域 ---
  const floodSources = [
    { dir: 'flood-l1', fixture: 'flood-l1.geojson', out: 'flood-l1.json', label: 'flood-l1' },
    { dir: 'flood-l2', fixture: 'flood-l2.geojson', out: 'flood-l2.json', label: 'flood-l2' },
  ];

  for (const src of floodSources) {
    const { features, placeholder: ownPlaceholder } = await loadFeaturesFromDir(
      join(RAW_DIR, src.dir),
      src.fixture,
      src.label,
    );
    const placeholder = ownPlaceholder || boundaryPlaceholder;
    placeholderByCategory[src.label] = placeholder;
    logPropertyKeys(src.label, features);

    const inBoundary = features.filter((f) => intersectsBoundary(f, boundary));
    const out = inBoundary.map((f) =>
      simplifyGeometry({
        type: 'Feature',
        properties: { rank: resolveFloodRank(f.properties || {}) },
        geometry: f.geometry,
      }),
    );

    // 計画規模（L1）のみ、河川流域の近似カバレッジ範囲を併せて出力する
    // （「区域外」と「データなし」の出し分けに使用。flood-l2 は洪水予報河川・
    // 水位周知河川とその他の河川の両方をカバーするため対象外）。
    const coverage = src.label === 'flood-l1' ? computeFloodL1Coverage(inBoundary) : null;
    if (src.label === 'flood-l1') {
      console.log(
        `[${src.label}] 流域カバレッジ範囲: ${coverage ? '算出済み（凸包+' + FLOOD_L1_COVERAGE_BUFFER_KM + 'kmバッファ）' : '算出不可（ポリゴンが少なすぎる）'}`,
      );
    }

    writeFileSync(
      join(PROCESSED_DIR, src.out),
      JSON.stringify(
        {
          type: 'FeatureCollection',
          placeholder,
          generatedAt: new Date().toISOString(),
          features: out,
          ...(coverage ? { coverage } : {}),
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
  let sedimentPlaceholder = boundaryPlaceholder;
  for (const src of sedimentSources) {
    const { features, placeholder } = await loadFeaturesFromDir(
      join(RAW_DIR, src.dir),
      src.fixture,
      src.dir,
    );
    if (features.length === 0) continue;
    sedimentPlaceholder ||= placeholder;
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

  placeholderByCategory.sediment = sedimentPlaceholder;

  writeFileSync(
    join(PROCESSED_DIR, 'sediment.json'),
    JSON.stringify(
      {
        type: 'FeatureCollection',
        placeholder: sedimentPlaceholder,
        generatedAt: new Date().toISOString(),
        features: sedimentFeatures,
      },
      null,
      2,
    ),
  );
  console.log(`[sediment] -> sediment.json (${sedimentFeatures.length} 地物)`);

  // --- 避難所（国土地理院 指定緊急避難場所データポータル CSV） ---
  const shelterCsvRecords = loadShelterRecordsFromCsvDir(join(RAW_DIR, 'shelters'));

  let shelters;
  let sheltersPlaceholder;
  if (shelterCsvRecords) {
    // ポータルは市区町村コード（38201=松山市）で問い合わせ済みのCSVを配布するため、
    // 松山市域の絞り込みは既に完了している。行政区域境界（ダミーの場合がある）で
    // 再フィルタすると、本物の避難所データがダミー境界の形状によって誤って
    // 除外されてしまうため、境界が実データのときのみ整合性チェックとして適用する。
    const filtered = boundaryPlaceholder
      ? shelterCsvRecords
      : shelterCsvRecords.filter((r) => pointInBoundary(makePointFeature(r.lng, r.lat), boundary));
    shelters = filtered.map(({ name, lat, lng, disasterTypes, category, acceptedGroups }) => ({
      name,
      lat,
      lng,
      disasterTypes,
      category,
      ...(acceptedGroups ? { acceptedGroups } : {}),
    }));
    sheltersPlaceholder = false;
    console.log(
      `[shelters] CSV実データ ${shelterCsvRecords.length}件 中、${shelters.length}件を採用${boundaryPlaceholder ? '（行政区域境界がダミーのため境界フィルタは未適用、CSV側の市区町村コード絞り込みを信頼）' : ''}`,
    );
  } else {
    console.warn(
      '[shelters] data/raw/shelters/ にCSVが見つからないため、動作確認用のダミーデータを使用します（本番公開前に実データを配置して再実行してください）',
    );
    const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, 'shelters.geojson'), 'utf-8'));
    logPropertyKeys('shelters', raw.features);
    shelters = raw.features
      .filter((f) => f.geometry && f.geometry.type === 'Point')
      .filter((f) => pointInBoundary(f, boundary))
      .map((f) => ({
        name: resolveShelterName(f.properties || {}),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        disasterTypes: resolveDisasterTypes(f.properties || {}),
      }));
    sheltersPlaceholder = true;
  }
  placeholderByCategory.shelters = sheltersPlaceholder;

  writeFileSync(join(PROCESSED_DIR, 'shelters.json'), JSON.stringify(shelters, null, 2));
  console.log(`[shelters] -> shelters.json (${shelters.length} 件, placeholder=${sheltersPlaceholder})`);

  const anyPlaceholder = Object.values(placeholderByCategory).some(Boolean);
  writeFileSync(
    join(PROCESSED_DIR, 'meta.json'),
    JSON.stringify(
      {
        placeholder: placeholderByCategory,
        generatedAt: new Date().toISOString(),
        note: anyPlaceholder
          ? '一部のデータがダミー（動作確認用）です。data/raw/ に実データを配置して npm run build:hazard-data を再実行してください。'
          : '実データから生成されました。',
      },
      null,
      2,
    ),
  );

  if (anyPlaceholder) {
    const dummyCategories = Object.entries(placeholderByCategory)
      .filter(([, v]) => v)
      .map(([k]) => k);
    console.warn(
      `\n⚠️ 以下のデータソースでダミーデータが使用されました: ${dummyCategories.join(', ')}\n   本番公開前に data/raw/ に実データを配置し、再度 npm run build:hazard-data を実行してください。\n`,
    );
  } else {
    console.log('\n✅ すべてのソースで実データが使用されました。');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
