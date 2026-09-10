// scripts/build-hazard-data.js の純粋なロジック部分に対する軽量テスト
// （Node.js 標準の node:test を使用。追加の依存パッケージは不要）。
// 実行方法: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {
  isRunAsMainModule,
  resolveFloodRank,
  FLOOD_L1_RANK_FIELD_CANDIDATES,
  FLOOD_L2_RANK_FIELD_CANDIDATES,
} from './build-hazard-data.js';

test('isRunAsMainModule: このファイル自身をimportしただけでは main扱いにならない', () => {
  // このテストファイル自身の import.meta.url を、実際にCLI実行された
  // build-hazard-data.js の絶対パス「ではない」ものとして渡す。
  assert.equal(isRunAsMainModule(import.meta.url, '/some/other/path.js'), false);
});

test('isRunAsMainModule: argv1が未設定（例: importのみ）の場合はfalse', () => {
  assert.equal(isRunAsMainModule(import.meta.url, undefined), false);
  assert.equal(isRunAsMainModule(import.meta.url, ''), false);
});

test('isRunAsMainModule: file:// URLをこのホストのネイティブパスに変換した値と一致すればtrue', () => {
  // pathToFileURL/fileURLToPath は常に「今動いているOSのパス規則」で
  // 変換する（Windows上で動かせばバックスラッシュ・ドライブレター表記に、
  // POSIX上で動かせばスラッシュ表記になる）。isRunAsMainModule は
  // fileURLToPath(metaUrl) と argv1 という「同じホストの同じ表現」同士を
  // 比較するだけなので、この対応関係さえ保たれていればOSを問わず成立する。
  const nativePath =
    process.platform === 'win32'
      ? 'C:\\repo\\scripts\\build-hazard-data.js'
      : '/repo/scripts/build-hazard-data.js';
  const metaUrl = pathToFileURL(nativePath).href;
  assert.equal(isRunAsMainModule(metaUrl, nativePath), true);
});

// 注意: pathToFileURL/fileURLToPath は「今動いているOS」の規則でしか
// 変換できないため、POSIX環境からWindowsのパス変換を模擬してテストする
// ことはできない（例えば 'C:\\Users\\...' をPOSIX上でpathToFileURLに
// 渡しても、Windowsパスとしては解釈されず意味のある結果にならない）。
// そのため「Windows実機での file:// URL ⇔ ネイティブパス変換」自体の
// 正しさはNode.js本体の実装に委ね、ここでは isRunAsMainModule が
// fileURLToPath(metaUrl) と argv1 を単純比較しているだけであること
// （＝どちらのOSでも同じロジックで動く）を上記テストで確認する。
// 実際にWindows環境で `npm test` を実行し、全テストがpassすることも
// 併せて確認するとより確実である。

test('isRunAsMainModule: パスが一致しない場合はfalse（import専用で呼ばれた場合の想定）', () => {
  const nativePath =
    process.platform === 'win32'
      ? 'C:\\repo\\scripts\\build-hazard-data.js'
      : '/repo/scripts/build-hazard-data.js';
  const otherPath =
    process.platform === 'win32'
      ? 'C:\\repo\\scripts\\other-script.js'
      : '/repo/scripts/other-script.js';
  const metaUrl = pathToFileURL(nativePath).href;
  assert.equal(isRunAsMainModule(metaUrl, otherPath), false);
});

test('resolveFloodRank: A31a_105 (計画規模) を優先し、無関係な属性(河川コード等)を無視する', () => {
  // 実際に報告された不具合の再現データ: A31a_101 に河川コード風の値が
  // 入っていても、A31a_105 の正しいランクコードが優先されるべき。
  const properties = { A31a_101: '8808010002', A31a_105: 3 };
  assert.equal(
    resolveFloodRank(properties, FLOOD_L1_RANK_FIELD_CANDIDATES),
    '3.0m以上5.0m未満',
  );
});

test('resolveFloodRank: A31a_105が無い場合、河川コードを浸水ランクとして採用しない', () => {
  const properties = { A31a_101: '8808010002' };
  assert.equal(resolveFloodRank(properties, FLOOD_L1_RANK_FIELD_CANDIDATES), '不明');
});

test('resolveFloodRank: flood-l2 は A31a_205 を参照する', () => {
  const properties = { A31a_105: 1, A31a_205: 4 };
  assert.equal(
    resolveFloodRank(properties, FLOOD_L2_RANK_FIELD_CANDIDATES),
    '5.0m以上10.0m未満',
  );
});

test('resolveFloodRank: 未知のコード値は「不明なコード」として明示される', () => {
  const properties = { A31a_105: 99 };
  assert.equal(
    resolveFloodRank(properties, FLOOD_L1_RANK_FIELD_CANDIDATES),
    '不明なコード（A31a_105=99）',
  );
});
