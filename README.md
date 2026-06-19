# NDLイメージバンク 顔ファインダー

国立国会図書館「イメージバンク」の近現代美人画(Public Domain Mark)から抽出した「顔」を、
IIIF でファセット検索・閲覧し、**IIIF Curation Viewer** で原本の領域として開けるブラウザ完結のファインダーです。
**ビルド不要の静的サイト**(vanilla JS)。

🔗 **公開サイト**: https://nakamura196.github.io/ndl-face-finder/

CODH「顔貌コレクション IIIF Curation Finder」に着想を得ています。

## 特徴

- 顔画像は **NDL の IIIF Image API から領域指定(`pct:`)で動的取得**(画像をホストしない)。
- ファセット: **テーマ / 作者 / 年代 / 性別 / 信頼度 / 検出器**。絞り込み状態は URL に同期し共有可能。
- **顔をクリック** → IIIF Curation Viewer がその顔の領域(canvas+xywh)へ拡大(`?pos=N`)。
- **テーマで開く** → アノテーションモードで全顔を一覧(`?mode=annotation`)。
- **図版一覧ページ**: 元画像(NDLの各ページ)と切り出し顔領域を並べて表示。
- 多言語(日本語 / English)、テーマ切替(light / dark / auto)。
- IIIF Curation Viewer(CODH, MIT)を `vendor/` に**同梱**し同一オリジンで開くため、ローカルでも動作。

## 構成

```
.
├── index.html              トップ(概要・使い方・データセット)
├── search.html / app.js    検索(ファセット絞り込み)
├── gallery.html / gallery.js  図版一覧
├── about.html / privacy.html  About / プライバシーポリシー
├── facets.js               共有ファセット UI
├── site.js                 GA / テーマ切替 / 多言語(i18n)
├── style.css               UTokyo デザイントークン(UTokyo Blue + Noto Sans/Serif JP)
├── data/                   faces.json / figures.json / meta.json
├── curations/works/        作品別 IIIF Curation(CODH拡張)
└── vendor/iiif-curation-viewer/  同梱 Viewer(CODH, MIT)
```

## データ

現在のデータセット: **顔336 / 図版198 / アイテム(NDL書誌)102 / テーマ6**(すべて PDM)。
水野年方・西川祐信・竹久夢二らの近現代美人画。3器アンサンブル検出 + VLM検証 + 人手確定で作成。

## ローカルで動かす

```
python3 -m http.server 8000   # → http://localhost:8000/
```

## ライセンス・クレジット

- **原本画像**: 国立国会図書館デジタルコレクション、Public Domain Mark(PDM)。本リポジトリは画像を含みません。
- **IIIF Curation Viewer**(`vendor/iiif-curation-viewer/`): Center for Open Data in the Humanities (CODH)、MIT License。
- **本ファインダーのコード**: MIT License([LICENSE](./LICENSE))。
