# 指定緊急避難場所データ（P20）

## 入手元
国土数値情報ダウンロードサービス: https://nlftp.mlit.go.jp/ksj/
データ一覧から「指定緊急避難場所データ（P20）」を選び、愛媛県分をダウンロードする。
GeoJSONが選べる場合はGeoJSONを推奨。

## ここに置くもの
Shapefile（`*.shp` `*.dbf` `*.shx` `*.prj`）または GeoJSON（`*.geojson`/`*.json`）一式。

## 属性の想定
P20データには施設名称・緯度経度・災害種別ごとの対応フラグ（洪水/崖崩れ・土石流及び地滑り/
高潮/地震/津波/大規模な火事/内水氾濫/火山現象 等、1=対応 0=非対応）の列がある。
列名は年度により異なるため、`scripts/build-hazard-data.js` 実行時のコンソール出力で
実際の属性名を確認し、`SHELTER_FIELD_CANDIDATES` に追記すること。

## 松山市分の絞り込みについて
このデータは県内全域を含むため、`data/raw/matsuyama-boundary/` の境界ポリゴンとの
`turf.booleanIntersects`（または `booleanPointInPolygon`）判定で松山市内の地点のみに
自動的に絞り込まれる。市区町村名の属性列がある場合はそちらでの絞り込みも可能。

## 備考
このディレクトリは `.gitignore` により Git 管理対象外（このREADMEのみ追跡）。
