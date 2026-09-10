# HazardCheck（ハザード診断ツール・松山市版）

住所または地図タップで、松山市内の

- 洪水浸水想定区域（計画規模 L1 / 想定最大規模 L2）
- 土砂災害警戒区域（急傾斜地の崩壊・土石流・地すべり）
- 最寄りの指定緊急避難場所

を診断する単発診断型のWebツール。松山市在住者向け防災情報Threadsアカウント
（@oimoinfobosai）の3つ目のツールとして、SafePin・防災グッズシミュレーターとは
独立したアプリとして構築している。

**⚠️ 非公式の個人開発アプリです。行政機関の公式サービスではありません。**

---

## 技術スタック

- React + Vite + Tailwind CSS v4
- Vercel（GitHub連携で自動デプロイ、`/api/*.js` は Vercel Serverless Functions）
- 地図: Leaflet + 地理院タイル
- 住所ジオコーディング: 国土地理院 住所検索API（第一候補）→ Google Geocoding API（フォールバック）
- ハザード判定: 事前に加工した静的データ（`data/processed/*.json`）に対する
  Point in Polygon 判定（`@turf/boolean-point-in-polygon`）— **実行時の外部API呼び出しなし**
- GA4 カスタムイベント

### 計画規模（L1）の「区域外」と「データなし」の区別

洪水浸水想定区域データは、河川の区分によって作成されているデータが異なる。

- **洪水予報河川・水位周知河川**: 計画規模（L1）・想定最大規模（L2）の両方が存在する
- **その他の河川**: 想定最大規模（L2）のみ存在し、計画規模（L1）のデータ自体が存在しない

そのため、`data/raw/flood-l1/` には洪水予報河川・水位周知河川区分の計画規模データのみを、
`data/raw/flood-l2/` には両区分の想定最大規模データを配置する（詳細は各ディレクトリの
`README.md` を参照）。

診断ロジック側では、計画規模（L1）に該当ポリゴンがない地点をすべて「区域外」とはせず、
`scripts/build-hazard-data.js` が `flood-l1/` の全ポリゴンから計算した流域の近似範囲
（凸包＋1kmバッファ、`data/processed/flood-l1.json` の `coverage` フィールド）を使って、

- 流域の近似範囲内だが該当ポリゴンなし → **「区域外」**
- 流域の近似範囲外（＝その他の河川の流域で、そもそもL1データが存在しない） →
  **「データなし（この地点は計画規模の指定がない河川の流域です）」**

を出し分けている（`src/lib/hazardLookup.js` の `matchFloodL1`）。この範囲判定はあくまで
近似（実際の河川流域界データではない）である点に注意する。

### ジオコーディング結果の番地一致チェック

GSI住所検索・Google Geocoding のいずれも、番地が正確にインデックスされていない住所
（特に「甲」「乙」等の旧地番表記）に対しては、字名レベルで一致する別の場所（学校等の
施設）の住所を返してしまうことがある（例: 「松山市中通甲775-1」を検索したのに、
近くの学校の住所「松山市中通甲807」が返る）。

これを防ぐため、`api/geocode.js`（`api/_lib/addressMatch.js` の `isBanchiMismatch`）は、
検索文字列と結果の住所文字列それぞれから最初の番地数字を抽出して比較し、食い違う候補は
却下する。すべての候補が番地不一致で却下された場合は、誤った場所を確信度高く返すのではなく
「見つかりませんでした」として地図からの選択を促す（ハザード診断アプリとして、不確かな
一致よりも未検出のほうが安全という判断）。

`GEOCODE_DEBUG=1` を設定すると、GSI・Googleそれぞれの生レスポンスと、番地不一致で
却下した候補・理由がサーバーログに出力される（`.env.example` 参照）。

---

## ⚠️ 本番公開前に必ず行うこと（重要）

`data/processed/meta.json` の `placeholder` はカテゴリごと（`flood-l1` / `flood-l2` /
`sediment` / `shelters`）にダミーデータかどうかを保持しており、`true` のカテゴリは
アプリの結果パネルにも警告バナーで表示される。現時点の状態:

| カテゴリ | 状態 |
|---|---|
| 避難所（`shelters.json`） | ✅ **実データ**（国土地理院 指定緊急避難場所データポータルの松山市分CSVから生成済み、829件） |
| 土砂災害警戒区域（`sediment.json`） | ✅ **実データ**（国土数値情報 A33データから松山市分を抽出、3,109件） |
| 洪水浸水想定（`flood-l1.json` / `flood-l2.json`） | ⚠️ ダミー（`scripts/fixtures/` の適当なポリゴン） |

洪水浸水想定区域については、本番公開前に以下の手順で実データに差し替えること。

### 1. 生データを手動でダウンロードして配置する

**洪水浸水想定・行政区域境界**は、国土数値情報ダウンロードサービス
（<https://nlftp.mlit.go.jp/ksj/>）から、以下のデータの**愛媛県分**（行政区域データのみ
都道府県全体でも可）をダウンロードし、それぞれのディレクトリに配置する。
各ディレクトリの `README.md` に詳しい手順を記載している。

| 配置先 | データ名 |
|---|---|
| `data/raw/flood-l1/` | 洪水浸水想定区域データ（計画規模。洪水予報河川・水位周知河川区分のみ存在） |
| `data/raw/flood-l2/` | 洪水浸水想定区域データ（想定最大規模。両区分とも存在） |
| `data/raw/matsuyama-boundary/` | 行政区域データ（N03、松山市域の絞り込み用） |

Shapefile（.shp/.dbf/.shx/.prj一式）でもGeoJSONでもよい（GeoJSONが選べるなら推奨）。

**土砂災害警戒区域**は既に実データ配置済み（国土数値情報「土砂災害警戒区域データ（A33）」の
GeoJSON、`data/raw/sediment/`）。更新する場合の手順は `data/raw/sediment/README.md` を参照。
1ファイルに急傾斜地の崩壊・土石流・地すべりの3種類が属性値（`A33_001`）で混在しており、
区域区分（`A33_002`）も 指定済み(1・2) / 指定前・基礎調査結果(3・4) の4段階を区別する。

**避難所**も既に実データ配置済みだが、更新する場合は国土地理院 指定緊急避難場所データ
ポータル（<https://hinanmap.gsi.go.jp/hinanjocheck/>）から松山市分（市区町村コード
`38201`）のCSV2種類を再取得し、`data/raw/shelters/` に置き換える。手順は
`data/raw/shelters/README.md` を参照。

`data/raw/` はGitで管理していない（`.gitignore` 対象、各READMEのみ追跡）。実際に配置した
生データはこのセッションのローカル環境にのみ存在し、リポジトリの clone/checkout では
再現されない点に注意する（`data/processed/*.json` として生成済みの結果のみコミットされる）。

### 2. バッチスクリプトを実行する

```bash
npm run build:hazard-data
```

`data/raw/` の生データを読み込み、`data/raw/matsuyama-boundary/` の境界と交差する
地物だけに絞り込んだ上で、`data/processed/flood-l1.json` `flood-l2.json`
`sediment.json` `shelters.json` `meta.json` を生成する。

実行時のコンソールに、洪水・土砂災害区域データで検出された属性（列）名の一覧が出力される。
国土数値情報の属性名は年度・提供形式によって変わることがあるため、`浸水ランク` などの
想定列名で解決できなかった場合は、`scripts/build-hazard-data.js` 内の
`FLOOD_L1_RANK_FIELD_CANDIDATES` / `FLOOD_L2_RANK_FIELD_CANDIDATES` にコンソールで確認した
実際の列名を追記して再実行すること。浸水ランクの属性は
`A31a_105`（計画規模）/ `A31a_205`（想定最大規模）が正しい列（要出典確認）で、
`A31a_101` 等の似た名前の属性（河川コード等）と取り違えないよう注意する。

`data/raw/flood-*/` `data/raw/sediment/` `data/raw/matsuyama-boundary/` に実データが
1件も見つからない場合は、動作確認用のダミーGeoJSON（`scripts/fixtures/`）で代替され、
そのカテゴリの `placeholder` が `true` になる。避難所は専用のCSVパーサーで処理され、
`data/raw/shelters/` にCSVが1件もない場合のみダミーにフォールバックする。

土砂災害警戒区域は、`data/raw/sediment/` の地物が持つ所在地属性（`A33_006` 等）に
「松山市」を含むかどうかで絞り込む（この属性で絞り込めた場合は、行政区域境界が
ダミーであっても実データ扱いになる）。属性による絞り込みができないデータの場合のみ、
行政区域境界とのポリゴン交差判定にフォールバックする。

### 3. 松山市内の既知地点で手動検証する

生成された `data/processed/*.json` を使ってアプリを実際に動かし、浸水想定がある
既知の地点／ない地点の両方で、公式ハザードマップ（ハザードマップポータルサイト）の
表示と結果が一致するか目視確認してから公開する。

---

## セットアップ

```bash
npm install
cp .env.example .env.local   # 必要に応じてGOOGLE_MAPS_API_KEY等を設定
npm run build:hazard-data    # data/processed/*.json を生成（初回はダミーデータ）
npm run dev
```

`vite dev` 単体では `/api/*.js`（Vercel Serverless Functions）は動作しない。
住所テキスト入力によるジオコーディングまで含めてローカル確認する場合は
[Vercel CLI](https://vercel.com/docs/cli) の `vercel dev` を使うこと。
地図タップによる診断は `/api/reverse-geocode` が失敗しても緯度経度表示にフォールバック
するため、`vite dev` のみでも動作確認できる。

### テスト

`scripts/build-hazard-data.js` の属性解決ロジック（浸水ランクの参照先属性、
CLI直接実行判定等）に対する軽量なユニットテストがある（追加パッケージ不要、
Node.js標準の `node:test` を使用）。

```bash
npm test
```

### 環境変数

`.env.example` を参照。

- `GOOGLE_MAPS_API_KEY`（サーバーサイドのみ、クライアントに露出しない）: 国土地理院
  住所検索APIで解決できなかった場合のフォールバックに使用。使用量に応じて課金が発生する。
- `VITE_GA_MEASUREMENT_ID`: GA4測定ID。未設定時はイベントをコンソールログのみに出力する。
- `VITE_GOODS_SIMULATOR_URL`: 防災グッズシミュレーターの公開URL確定後に設定する
  （未設定の間はフッターにリンクを表示しない）。

---

## ディレクトリ構成

```
api/                       Vercel Serverless Functions
  geocode.js                住所→緯度経度（GSI→Google フォールバック）
  reverse-geocode.js        緯度経度→住所（GSI逆ジオコーダー）
  _lib/normalizeAddress.js  住所文字列の正規化・表記ゆれ吸収
data/
  raw/                      手動配置する生データ（Gitignore対象、READMEのみ追跡）
  processed/                加工済み軽量データ（コミット対象）
scripts/
  build-hazard-data.js      data/raw → data/processed 変換バッチ
  fixtures/                 生データ未配置時に使うダミーGeoJSON
src/
  components/               UI コンポーネント
  lib/
    hazardLookup.js          data/processed/*.json に対するPoint in Polygon判定・最近傍避難所探索
    api.js                   /api/geocode, /api/reverse-geocode 呼び出し
    ga.js                    GA4連携
    shareText.js             シェア文言テンプレート
    constants.js             SafePin等の外部リンク定数
```

---

## GA4イベント

| イベント名 | 発火タイミング | パラメータ |
|---|---|---|
| `hazard_search` | 診断実行時 | `input_method`: `"text"` \| `"map"` |
| `hazard_result_view` | 結果パネル表示時 | `flood_hit`, `sediment_hit`: boolean |
| `hazard_safepin_click` | 「SafePinで詳しく見る」クリック時 | なし |
| `hazard_share_click` | シェアボタン押下時 | `share_method`: `"x"` \| `"threads"` \| `"line"` \| `"web_share"` |

---

## デプロイ（Vercel）

GitHubリポジトリを Vercel に連携し、`main`（または運用ブランチ）への push で自動デプロイする。
環境変数（`GOOGLE_MAPS_API_KEY` / `VITE_GA_MEASUREMENT_ID` / `VITE_GOODS_SIMULATOR_URL`）は
Vercel のプロジェクト設定で登録する。`data/processed/*.json` はビルド成果物に含まれるため、
実データへの更新後は再度 `npm run build:hazard-data` を実行し、コミット・pushすること。
