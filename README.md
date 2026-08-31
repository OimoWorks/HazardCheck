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

---

## ⚠️ 本番公開前に必ず行うこと（重要）

このリポジトリの `data/processed/*.json` は、**現時点では動作確認用のダミーデータ**
（`scripts/fixtures/` の適当なポリゴン・ダミー避難所）から生成されています。
実際のハザード情報ではありません。`data/processed/meta.json` の `placeholder` が
`true` の間は、アプリの結果パネルにも警告バナーが表示されます。

本番公開前に、以下の手順で実データに差し替えてください。

### 1. 生データを手動でダウンロードして配置する

国土数値情報ダウンロードサービス（<https://nlftp.mlit.go.jp/ksj/>）から、以下のデータの
**愛媛県分**（行政区域データのみ都道府県全体でも可）をダウンロードし、それぞれの
ディレクトリに配置する。各ディレクトリの `README.md` に詳しい手順を記載している。

| 配置先 | データ名 |
|---|---|
| `data/raw/flood-l1/` | 洪水浸水想定区域データ（計画規模） |
| `data/raw/flood-l2/` | 洪水浸水想定区域データ（想定最大規模） |
| `data/raw/sediment-steep/` | 土砂災害警戒区域データ（急傾斜地の崩壊） |
| `data/raw/sediment-debris/` | 土砂災害警戒区域データ（土石流） |
| `data/raw/sediment-landslide/` | 土砂災害警戒区域データ（地すべり） |
| `data/raw/shelters/` | 指定緊急避難場所データ（P20） |
| `data/raw/matsuyama-boundary/` | 行政区域データ（N03、松山市域の絞り込み用） |

Shapefile（.shp/.dbf/.shx/.prj一式）でもGeoJSONでもよい（GeoJSONが選べるなら推奨）。
`data/raw/` はGitで管理していない（`.gitignore` 対象、各READMEのみ追跡）。

### 2. バッチスクリプトを実行する

```bash
npm run build:hazard-data
```

`data/raw/` の生データを読み込み、`data/raw/matsuyama-boundary/` の境界と交差する
地物だけに絞り込んだ上で、`data/processed/flood-l1.json` `flood-l2.json`
`sediment.json` `shelters.json` `meta.json` を生成する。

実行時のコンソールに、各データソースで検出された属性（列）名の一覧が出力される。
国土数値情報の属性名は年度・提供形式によって変わることがあるため、
`浸水ランク` や `施設名称` などの想定列名で解決できなかった場合は、
`scripts/build-hazard-data.js` 内の `*_FIELD_CANDIDATES` にコンソールで確認した
実際の列名を追記して再実行すること。

`data/raw/<ソース>/` に実データが1件も見つからない場合は、動作確認用の
ダミーGeoJSON（`scripts/fixtures/`）で代替され、`placeholder: true` が出力される。

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
