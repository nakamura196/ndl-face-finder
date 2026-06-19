// 共通基盤: Google Analytics 4 / テーマ切替(light/dark/auto) / 多言語(ja/en)。
// 各ページが <script type="module" src="site.js"> で読み込む。
// 動的描画(app.js / gallery.js)は import { t, tVal, getLang, onLang } from "./site.js"。

/* ===== Google Analytics 4(nakamura196 共通プロパティ) ===== */
const GA_ID = "G-G0619D6ER0";
if (GA_ID && location.protocol.startsWith("http")) {
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
}

/* ===== テーマ(light / dark / auto) ===== */
const TKEY = "ndl-face-finder:theme";
export function getTheme() {
  try { const v = localStorage.getItem(TKEY); if (["light", "dark", "auto"].includes(v)) return v; } catch {}
  return "auto";
}
export function applyTheme(th) {
  const el = document.documentElement;
  if (th === "auto") el.removeAttribute("data-theme"); else el.setAttribute("data-theme", th);
  try { localStorage.setItem(TKEY, th); } catch {}
}
applyTheme(getTheme()); // 早期適用(ちらつき低減)

/* ===== i18n(ja / en) ===== */
const LKEY = "ndl-face-finder:lang";
let lang = (() => {
  try { const v = localStorage.getItem(LKEY); if (v === "ja" || v === "en") return v; } catch {}
  return (navigator.language || "ja").toLowerCase().startsWith("ja") ? "ja" : "en";
})();
const subs = new Set();
export const getLang = () => lang;
export const onLang = (fn) => subs.add(fn);

const DICT = {
  ja: {
    "brand.title": "NDLイメージバンク 顔ファインダー",
    "brand.tagline": "NDLイメージバンク(PDM)の図版から抽出した顔を IIIF で検索・閲覧し Curation Viewer で開く",
    "nav.home": "トップ", "nav.search": "検索", "nav.gallery": "図版一覧",
    "nav.about": "このサイトについて", "nav.privacy": "プライバシー",
    "unit.faces": "顔", "unit.figs": "図版",
    // landing
    "hero.tagline": "国立国会図書館「イメージバンク」の近現代美人画(Public Domain Mark)から抽出した「顔」を、IIIF でファセット検索・閲覧し、IIIF Curation Viewer で原本の領域として開く。",
    "hero.badge1": "IIIF 領域で動的取得", "hero.badge2": "Curation Viewer 連携", "hero.badge3": "Public Domain",
    "hero.ctaSearch": "顔を検索する →", "hero.ctaGallery": "図版一覧を見る",
    "hero.howtoSoon": "📹 使い方の動画は準備中です", "hero.howtoCap": "使い方を動画で見る",
    "feat.title": "使い方",
    "feat.1.t": "1. 絞り込む", "feat.1.b": "テーマ・年代・性別・信頼度・検出器で顔を絞り込み。絞り込み状態は URL に反映され共有できます。",
    "feat.2.t": "2. 顔をクリック", "feat.2.b": "顔をクリックすると、その顔を IIIF Curation Viewer が原本の該当領域(canvas+xywh)へ拡大表示します。",
    "feat.3.t": "3. 一覧で閲覧", "feat.3.b": "テーマ単位で開くとアノテーションモードで全ての顔を一覧。図版一覧では元画像と切り出し領域を並べて確認できます。",
    "ds.title": "現在のデータセット",
    "ds.faces": "顔(GT)", "ds.figs": "図版", "ds.items": "アイテム", "ds.themes": "テーマ", "ds.license": "ライセンス",
    "ds.note": "近現代美人画(NDL イメージバンク・Public Domain Mark)を対象に、3器アンサンブル検出 + VLM検証 + 人手確定で作成。アイテム=NDLの書誌(マニフェスト)、テーマ=取得時のコレクション括り。手法自体は美人画に限らず適用できます。",
    "ds.more": "データの詳細・出典 →",
    // search
    "search.placeholder": "作品名で検索…", "search.clear": "絞り込みをクリア",
    "search.curList": "Curation List",
    "search.curHint": "絞り込みに該当するテーマの curation。クリックでアノテーションモードの Viewer が開きます。",
    "search.bundleNote": "IIIF Curation Viewer を同梱(同一オリジン)。ローカルでもそのまま開けます。",
    "search.empty": "該当する顔がありません。", "search.noWork": "該当するテーマがありません。",
    "search.footer": "顔カードのクリックでその顔を拡大表示、Curation List のクリックでテーマ全体をアノテーション一覧表示します。",
    "search.cardTitle": "クリックでこの顔を Viewer で拡大表示",
    "facet.theme": "テーマ", "facet.creator": "作者", "facet.era": "年代", "facet.sex": "性別", "facet.conf": "信頼度", "facet.source": "検出器",
    // gallery
    "gallery.tagline": "元画像と切り出した顔領域を並べて一覧 — クリックで Curation Viewer",
    "gallery.theme": "テーマ", "gallery.all": "すべて", "gallery.sort": "並び替え",
    "sort.facesDesc": "顔の多い順", "sort.facesAsc": "顔の少ない順",
    "sort.yearAsc": "年代が古い順", "sort.yearDesc": "年代が新しい順", "sort.default": "既定(テーマ順)",
    "gallery.hint": "元画像クリック=テーマをアノテーション一覧表示 / 顔クリック=その顔を拡大表示(同梱 Viewer)。",
    "gallery.ndl": "NDLで見る ↗", "gallery.anno": "アノテーション一覧 ↗",
    "common.dataAbout": "データについて →",
    "footer.src": "出典: 国立国会図書館デジタルコレクション(IIIF / Public Domain Mark)。",
  },
  en: {
    "brand.title": "NDL Imagebank Face Finder",
    "brand.tagline": "Search & browse faces extracted from NDL Imagebank (PDM) via IIIF, open in Curation Viewer",
    "nav.home": "Home", "nav.search": "Search", "nav.gallery": "Figures",
    "nav.about": "About", "nav.privacy": "Privacy",
    "unit.faces": "faces", "unit.figs": "figures",
    "hero.tagline": "Browse and facet-search “faces” extracted from modern bijin-ga in the NDL “Imagebank” (Public Domain Mark) via IIIF, and open each as a region of the original in the IIIF Curation Viewer.",
    "hero.badge1": "Dynamic IIIF regions", "hero.badge2": "Curation Viewer", "hero.badge3": "Public Domain",
    "hero.ctaSearch": "Search faces →", "hero.ctaGallery": "Browse figures",
    "hero.howtoSoon": "📹 Tutorial video coming soon", "hero.howtoCap": "Watch the tutorial",
    "feat.title": "How to use",
    "feat.1.t": "1. Filter", "feat.1.b": "Filter faces by theme, era, sex, confidence and detector. The filter state is reflected in the URL and shareable.",
    "feat.2.t": "2. Click a face", "feat.2.b": "Click a face and the IIIF Curation Viewer zooms to the exact region (canvas+xywh) of the original.",
    "feat.3.t": "3. Browse", "feat.3.b": "Open a theme to see all faces in annotation mode. The figures page shows source images and cropped regions side by side.",
    "ds.title": "Current dataset",
    "ds.faces": "faces (GT)", "ds.figs": "figures", "ds.items": "items", "ds.themes": "themes", "ds.license": "license",
    "ds.note": "Built from modern bijin-ga (NDL Imagebank, Public Domain Mark) via a 3-detector ensemble + VLM verification + manual confirmation. Item = NDL bibliographic record (manifest), theme = collection bucket at fetch time. The method is not limited to bijin-ga.",
    "ds.more": "Data details & source →",
    "search.placeholder": "Search by title…", "search.clear": "Clear filters",
    "search.curList": "Curation List",
    "search.curHint": "Curations of themes matching the filter. Click to open the Viewer in annotation mode.",
    "search.bundleNote": "IIIF Curation Viewer is bundled (same origin) — works locally too.",
    "search.empty": "No matching faces.", "search.noWork": "No matching themes.",
    "search.footer": "Click a face card to zoom to it; click a Curation List row to view the whole theme in annotation mode.",
    "search.cardTitle": "Click to zoom this face in the Viewer",
    "facet.theme": "Theme", "facet.creator": "Creator", "facet.era": "Era", "facet.sex": "Sex", "facet.conf": "Confidence", "facet.source": "Detector",
    "gallery.tagline": "Source images and cropped faces side by side — click for the Curation Viewer",
    "gallery.theme": "Theme", "gallery.all": "All", "gallery.sort": "Sort",
    "sort.facesDesc": "Most faces", "sort.facesAsc": "Fewest faces",
    "sort.yearAsc": "Oldest first", "sort.yearDesc": "Newest first", "sort.default": "Default (by theme)",
    "gallery.hint": "Click source image = annotation list of the theme / click a face = zoom that face (bundled Viewer).",
    "gallery.ndl": "View on NDL ↗", "gallery.anno": "Annotation list ↗",
    "common.dataAbout": "About the data →",
    "footer.src": "Source: NDL Digital Collections (IIIF / Public Domain Mark).",
  },
};

// 値ラベル(性別/年代/信頼度)の対訳。テーマ名などの固有名詞は対象外(そのまま返す)。
const VALUE_MAP = {
  "女性": { en: "Female" }, "男性": { en: "Male" }, "不明": { en: "Unknown" },
  "江戸": { en: "Edo" }, "明治": { en: "Meiji" }, "大正": { en: "Taishō" }, "昭和": { en: "Shōwa" },
  "高 (0.8+)": { en: "High (0.8+)" }, "中 (0.65–0.8)": { en: "Mid (0.65–0.8)" }, "低 (–0.65)": { en: "Low (–0.65)" },
};
export function tVal(label) {
  if (lang === "ja") return label;
  return (VALUE_MAP[label] && VALUE_MAP[label].en) || label;
}
export function t(key) {
  return (DICT[lang] && DICT[lang][key]) ?? DICT.ja[key] ?? key;
}

export function applyI18n(root = document) {
  // 言語別ブロック(About/Privacy の対訳)。data-lang="ja|en" を現在言語だけ表示。
  root.querySelectorAll("[data-lang]").forEach((el) => { el.hidden = el.getAttribute("data-lang") !== lang; });
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.getAttribute("data-i18n-attr").split(",").forEach((pair) => {
      const [attr, key] = pair.split(":");
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    });
  });
}
export function setLang(l) {
  lang = l;
  try { localStorage.setItem(LKEY, l); } catch {}
  document.documentElement.lang = l;
  applyI18n();
  subs.forEach((fn) => fn(l));
}

/* ===== ヘッダーのトグル配線 + 初期適用 ===== */
function wireControls() {
  document.documentElement.lang = lang;
  applyI18n();
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    const upd = () => { const th = getTheme(); btn.textContent = th === "light" ? "☀️" : th === "dark" ? "🌙" : "🌓"; btn.title = `テーマ: ${th}`; };
    upd();
    btn.addEventListener("click", () => {
      const cur = getTheme();
      applyTheme(cur === "auto" ? "light" : cur === "light" ? "dark" : "auto");
      upd();
    });
  });
  document.querySelectorAll("[data-lang-toggle]").forEach((btn) => {
    const upd = () => { btn.textContent = lang === "ja" ? "EN" : "日本語"; };
    upd();
    btn.addEventListener("click", () => { setLang(lang === "ja" ? "en" : "ja"); upd(); });
  });
}
if (document.readyState !== "loading") wireControls();
else document.addEventListener("DOMContentLoaded", wireControls);
