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
    "mascot.name": "筆くん", "mascot.greet": "顔をさがしてみよう!",
    // landing
    "hero.tagline": "国立国会図書館「イメージバンク」の近現代美人画(Public Domain Mark)から抽出した「顔」を、IIIF でファセット検索・閲覧し、IIIF Curation Viewer で原本の領域として開く。",
    "hero.badge1": "IIIF 領域で動的取得", "hero.badge2": "Curation Viewer 連携", "hero.badge3": "Public Domain",
    "hero.ctaSearch": "顔を検索する →", "hero.ctaGallery": "図版一覧を見る",
    "hero.howtoSoon": "📹 使い方の動画は準備中です", "hero.howtoCap": "使い方を動画で見る",
    "feat.title": "使い方",
    "feat.1.t": "1. 絞り込む", "feat.1.b": "テーマ・年代・性別・信頼度・検出器で顔を絞り込み。絞り込み状態は URL に反映され共有できます。",
    "feat.2.t": "2. 顔をクリック", "feat.2.b": "顔をクリックすると、同じ画面に原本(IIIF)が開き、その顔の領域へ拡大表示(OpenSeadragon)。‹前/次›で結果を順送りできます。",
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
    "search.cardTitle": "クリックで原本の該当領域を拡大表示",
    "facet.collection": "コレクション", "facet.theme": "テーマ", "facet.creator": "作者", "facet.era": "年代", "facet.sex": "性別", "facet.conf": "信頼度", "facet.source": "検出器",
    // viewer (OSD dialog)
    "viewer.title": "顔領域ビューア", "viewer.close": "閉じる", "viewer.prev": "前の顔", "viewer.next": "次の顔",
    "viewer.full": "原寸", "viewer.allFaces": "全顔を一覧", "viewer.untitled": "(無題)",
    // gallery
    "gallery.tagline": "元画像と切り出した顔領域を並べて一覧 — クリックで原本をその場で拡大",
    "gallery.origTitle": "クリックでページ全体を表示(図版内の全顔をハイライト)",
    "gallery.theme": "テーマ", "gallery.all": "すべて", "gallery.sort": "並び替え",
    "sort.facesDesc": "顔の多い順", "sort.facesAsc": "顔の少ない順",
    "sort.yearAsc": "年代が古い順", "sort.yearDesc": "年代が新しい順", "sort.default": "既定(テーマ順)",
    "gallery.hint": "元画像クリック=ページ全体を表示(全顔をハイライト) / 顔クリック=その顔を原本上で拡大。‹前/次›で順送り。",
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
    "mascot.name": "Fude-kun", "mascot.greet": "Let’s find some faces!",
    "hero.tagline": "Browse and facet-search “faces” extracted from modern bijin-ga in the NDL “Imagebank” (Public Domain Mark) via IIIF, and open each as a region of the original in the IIIF Curation Viewer.",
    "hero.badge1": "Dynamic IIIF regions", "hero.badge2": "Curation Viewer", "hero.badge3": "Public Domain",
    "hero.ctaSearch": "Search faces →", "hero.ctaGallery": "Browse figures",
    "hero.howtoSoon": "📹 Tutorial video coming soon", "hero.howtoCap": "Watch the tutorial",
    "feat.title": "How to use",
    "feat.1.t": "1. Filter", "feat.1.b": "Filter faces by theme, era, sex, confidence and detector. The filter state is reflected in the URL and shareable.",
    "feat.2.t": "2. Click a face", "feat.2.b": "Click a face to open the original (IIIF) right in the page and zoom to that face's region (OpenSeadragon). Use ‹prev/next› to step through results.",
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
    "search.cardTitle": "Click to zoom to this region on the original",
    "facet.collection": "Collection", "facet.theme": "Theme", "facet.creator": "Creator", "facet.era": "Era", "facet.sex": "Sex", "facet.conf": "Confidence", "facet.source": "Detector",
    "viewer.title": "Face region viewer", "viewer.close": "Close", "viewer.prev": "Previous", "viewer.next": "Next",
    "viewer.full": "Full size", "viewer.allFaces": "All faces", "viewer.untitled": "(untitled)",
    "gallery.tagline": "Source images and cropped faces side by side — click to zoom the original in place",
    "gallery.origTitle": "Click to view the whole page (all faces highlighted)",
    "gallery.theme": "Theme", "gallery.all": "All", "gallery.sort": "Sort",
    "sort.facesDesc": "Most faces", "sort.facesAsc": "Fewest faces",
    "sort.yearAsc": "Oldest first", "sort.yearDesc": "Newest first", "sort.default": "Default (by theme)",
    "gallery.hint": "Click source image = view the whole page (all faces highlighted) / click a face = zoom to it on the original. ‹prev/next› to step through.",
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
  "美人画": { en: "Bijin-ga (beauties)" }, "いろいろな絵（行事・妖怪・動物ほか）": { en: "Other subjects (events, yōkai, animals…)" },
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

/* ===== 常駐マスコット「筆くん」(左下のコンパニオン) ===== */
// 元サイト(web/)の伴奏ドックに倣い、全ページの左下に筆くんを表示。
// 吹き出しはヒントをローテーション。× で閉じる(localStorage 記憶)、本体クリックで次のヒント。
export function mascotSVG(size = 46, idp = "mc") {
  const w = Math.round(size * (130 / 150));
  return `<svg class="mascot mascot-bob" viewBox="0 0 130 150" width="${w}" height="${size}" role="img" aria-label="${t("mascot.name")}">
    <defs>
      <linearGradient id="${idp}-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9d6aa"/><stop offset="0.5" stop-color="#d8bf86"/><stop offset="1" stop-color="#c6a865"/></linearGradient>
      <linearGradient id="${idp}-tip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3b42"/><stop offset="1" stop-color="#0c0c10"/></linearGradient>
    </defs>
    <rect x="50" y="14" width="30" height="76" rx="15" fill="url(#${idp}-wood)" stroke="#b8975a" stroke-width="1.5"/>
    <line x1="50" y1="40" x2="80" y2="40" stroke="#b8975a" stroke-width="1.2" opacity="0.55"/>
    <line x1="50" y1="62" x2="80" y2="62" stroke="#b8975a" stroke-width="1.2" opacity="0.55"/>
    <path d="M65 14 q0 -9 6 -9 q7 0 7 7" fill="none" stroke="#c6a865" stroke-width="2.5"/>
    <rect x="47" y="88" width="36" height="12" rx="3" fill="#d3bd95" stroke="#a98f57" stroke-width="1"/>
    <path d="M50 98 q15 7 30 0 q-2 32 -15 47 q-13 -15 -15 -47z" fill="url(#${idp}-tip)"/>
    <path d="M62 103 q4 2 8 0 q-2 22 -4 33 q-2 -11 -4 -33z" fill="#4c4c55" opacity="0.5"/>
    <circle cx="65" cy="146" r="2.6" fill="#1f2430"/>
    <path d="M56 53 q4 -5 8 0" fill="none" stroke="#23262e" stroke-width="2" stroke-linecap="round"/>
    <path d="M66 53 q4 -5 8 0" fill="none" stroke="#23262e" stroke-width="2" stroke-linecap="round"/>
    <path d="M60 58 q5 7 10 0 q-5 4 -10 0z" fill="#9a4d44"/>
    <circle cx="54" cy="59" r="3" fill="#f0a9a0" opacity="0.55"/><circle cx="76" cy="59" r="3" fill="#f0a9a0" opacity="0.55"/>
  </svg>`;
}

const TIPS = {
  ja: [
    "テーマや作者で顔をしぼりこめるよ。",
    "顔をクリックすると、原本の領域に拡大表示できるよ。",
    "「図版一覧」では元画像と切り出した顔を並べて見られるよ。",
    "右上で 日本語/English と 明暗テーマ を切り替えられるよ。",
    "絞り込んだ状態は URL で共有できるよ。",
  ],
  en: [
    "Filter faces by theme or creator.",
    "Click a face to zoom into the region of the original.",
    "“Figures” shows source images and cropped faces side by side.",
    "Switch language and light/dark theme at the top right.",
    "Your filter state can be shared via the URL.",
  ],
};
const CKEY = "ndl-face-finder:companion";

function mountCompanion() {
  if (document.querySelector(".companion-dock, .companion-reopen")) return;
  let i = 0, timer = null;
  const tips = () => TIPS[lang] || TIPS.ja;

  const reopen = document.createElement("button");
  reopen.className = "companion-reopen"; reopen.hidden = true;
  reopen.setAttribute("aria-label", t("mascot.name"));
  reopen.innerHTML = mascotSVG(40, "mcr");

  const dock = document.createElement("div");
  dock.className = "companion-dock";
  const btn = document.createElement("button");
  btn.className = "companion-mascot-btn"; btn.setAttribute("aria-label", t("mascot.name"));
  btn.innerHTML = mascotSVG(48, "mcd");
  const bubble = document.createElement("div");
  bubble.className = "companion-bubble";
  const txt = document.createElement("span");
  const x = document.createElement("button");
  x.className = "companion-x"; x.textContent = "×"; x.setAttribute("aria-label", "close");
  bubble.append(txt, x);
  dock.append(btn, bubble);

  const show = (n) => {
    i = (n + tips().length) % tips().length;
    txt.textContent = tips()[i];
    bubble.style.animation = "none"; void bubble.offsetWidth; bubble.style.animation = "";
  };
  const start = () => { stop(); timer = setInterval(() => show(i + 1), 8000); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };

  const open = () => {
    reopen.hidden = true; document.body.append(dock);
    show(i); start();
    try { localStorage.setItem(CKEY, "1"); } catch {}
  };
  const close = () => {
    stop(); dock.remove(); reopen.hidden = false; document.body.append(reopen);
    try { localStorage.setItem(CKEY, "0"); } catch {}
  };

  btn.addEventListener("click", () => show(i + 1));
  x.addEventListener("click", close);
  reopen.addEventListener("click", open);
  onLang(() => { show(i); reopen.innerHTML = mascotSVG(40, "mcr"); btn.innerHTML = mascotSVG(48, "mcd"); });

  let on = true;
  try { on = localStorage.getItem(CKEY) !== "0"; } catch {}
  if (on) open(); else { reopen.hidden = false; document.body.append(reopen); }
}
if (document.readyState !== "loading") mountCompanion();
else document.addEventListener("DOMContentLoaded", mountCompanion);
