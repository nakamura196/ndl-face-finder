// 図版一覧ページ — 元画像(ページ全体)+ 切り出した顔領域のサムネ一覧。
// 検索ページと共通のファセット絞り込み(facets.js)+ 並び替え。クリックで Curation Viewer。

import { t, tVal, onLang } from "./site.js";
import {
  confBucket, makeSelections, selectionsFromParams, selectionsToParams,
  clearSelections, matches, renderFacets, updateAvailability,
} from "./facets.js";
import { openViewer, fromFull } from "./viewer.js";

const IIIF = "https://dl.ndl.go.jp/api/iiif";
const ridOf = (fig) => (fromFull(fig.faces[0]?.full) || {}).rid;

// 図版の顔crop → ビューア descriptor(原本IIIF領域 + メタ)。pid/rid/pct は full URL から復元。
const cropDescriptor = (fig, fa) => {
  const r = fromFull(fa.full) || {};
  return {
    pid: fig.pid, rid: r.rid, pct: r.pct, title: fig.title, theme: fig.theme,
    creator: fig.creator, conf: fa.conf, sex: fa.sex, viewer: fig.viewer, full: fa.full,
    workFile: fig.work_file, pos: fa.pos,
  };
};

// 元画像 → ページ全体表示の descriptor(画像全体にフィットし、図版内の全顔をハイライト)。
const pageDescriptor = (fig) => {
  const rid = ridOf(fig);
  return {
    pid: fig.pid, rid, title: fig.title, theme: fig.theme, creator: fig.creator,
    viewer: fig.viewer, full: `${IIIF}/${fig.pid}/${rid}/full/full/0/default.jpg`,
    workFile: fig.work_file, pos: fig._annoPos,
    regions: fig.faces.map((fa) => (fromFull(fa.full) || {}).pct).filter(Boolean),
  };
};

// 図版1件が各ファセットで持つ値。theme/creator/era は図版単位、性別・信頼度・検出器は
// 図版内の全顔から集約(いずれかの顔が該当すればその図版がヒット)。
const figAccessor = (fig, key) => {
  switch (key) {
    case "collection": return [fig.collection];
    case "theme": return [fig.theme];
    case "creator": return [fig.creator];
    case "era": return [fig.era];
    case "sex": return fig.faces.map((fa) => fa.sex);
    case "conf_bucket": return fig.faces.map((fa) => confBucket(fa.conf));
    case "source": return fig.faces.flatMap((fa) => fa.sources);
    default: return [];
  }
};

// viewer は同梱(codh-mirror の IIIF Curation Viewer, MIT)。常に同一オリジンで開く。
const CURATION_VIEWER = new URL("vendor/iiif-curation-viewer/index.html", location.href).href;

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const c of kids) n.append(c?.nodeType ? c : document.createTextNode(c));
  return n;
};
function viewerUrl(file, opts = {}) {
  let u = `${CURATION_VIEWER}?curation=${encodeURIComponent(new URL(file, location.href).href)}`;
  if (opts.mode) u += `&mode=${opts.mode}`;
  if (opts.pos) u += `&pos=${opts.pos}`;
  return u;
}

// 並び替え。顔数 → 顔の多い/少ない順、年代 → year(無い場合は末尾)。
const SORTERS = {
  "faces-desc": (a, b) => b.faces.length - a.faces.length,
  "faces-asc": (a, b) => a.faces.length - b.faces.length,
  "year-asc": (a, b) => (a.year ?? Infinity) - (b.year ?? Infinity),
  "year-desc": (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity),
  "default": null,
};

let FIGS = [];
let GVIEW = []; // 表示中の全顔crop の descriptor(顔クリックの prev/next 対象)
let PVIEW = []; // 表示中の全図版(ページ)の descriptor(元画像クリックの prev/next 対象)
const sel = makeSelections();

async function init() {
  FIGS = await fetch("data/figures.json").then((r) => r.json());
  // アノテーションモードの pos はページ(コマ)単位。Viewer が同一キャンバスを集約するため、
  // 顔単位の pos ではなく「この作品の何コマ目か」を渡す必要がある。
  // figures.json の作品内の並びは curation のコマ順と一致する(全作品で検証済)。
  const annoCount = {};
  for (const f of FIGS) f._annoPos = (annoCount[f.work_file] = (annoCount[f.work_file] || 0) + 1);
  $("#fig-count").textContent = FIGS.length;
  $("#face-count").textContent = FIGS.reduce((a, f) => a + f.faces.length, 0);
  $("#total-figs").textContent = FIGS.length;

  const sortSel = $("#sort");
  const p = new URLSearchParams(location.search);
  selectionsFromParams(sel, p);
  sortSel.value = p.get("sort") || "faces-desc";

  drawFacets();
  sortSel.addEventListener("change", () => { syncUrl(); render(); });
  $("#clear-facets").addEventListener("click", () => {
    clearSelections(sel);
    document.querySelectorAll(".facet-opt input").forEach((c) => (c.checked = false));
    syncUrl();
    render();
  });
  render();
  onLang(() => { drawFacets(); render(); }); // 言語切替で再描画
}

function syncUrl() {
  const p = new URLSearchParams();
  selectionsToParams(sel, p);
  const sort = $("#sort").value;
  if (sort && sort !== "faces-desc") p.set("sort", sort);
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function drawFacets() {
  renderFacets($("#facet-groups"), {
    allItems: FIGS,
    sel,
    accessor: figAccessor,
    onChange: () => { syncUrl(); render(); },
  });
}

function render() {
  const box = $("#gallery");
  box.innerHTML = "";
  const rows = FIGS.filter((f) => matches(f, sel, figAccessor));
  const cmp = SORTERS[$("#sort").value];
  if (cmp) rows.sort(cmp);
  $("#result-count").textContent = rows.length;
  $("#empty").hidden = rows.length > 0;
  GVIEW = [];
  PVIEW = [];
  const frag = document.createDocumentFragment();
  for (const fig of rows) frag.append(figureRow(fig));
  box.append(frag);
  updateAvailability($("#facet-groups"), rows, sel, figAccessor);
}

function figureRow(fig) {
  const annoOpts = { mode: "annotation", pos: fig._annoPos };
  const row = el("section", { class: "fig-row" });

  // 元画像クリック = 同一画面のビューアでページ全体を表示し、図版内の全顔をハイライト。
  // prev/next は表示中の全図版(ページ)を順送り(PVIEW)。
  const pi = PVIEW.length;
  PVIEW.push(pageDescriptor(fig));

  // 左: 元画像(ページ全体)
  const orig = el("figure", { class: "fig-orig", title: t("gallery.origTitle"), onclick: () => openViewer(PVIEW, pi) },
    el("img", { class: "orig-img", src: fig.image, loading: "lazy", alt: fig.title }),
    el("figcaption", {},
      el("b", {}, fig.title || "—"),
      el("span", {}, ` ${tVal(fig.theme)}`),
      el("span", { class: "muted" }, `  ${tVal(fig.era)}${fig.year ? " " + fig.year : ""} · ${fig.faces.length} ${t("unit.faces")}`))
  );

  // 右: 切り出した顔領域。クリック = その顔を同一画面のビューア(OSD)で原本領域へ拡大。
  // prev/next は表示中の全顔crop を順送り(GVIEW)。
  const crops = el("div", { class: "fig-crops" });
  for (const fa of fig.faces) {
    const gi = GVIEW.length;
    GVIEW.push(cropDescriptor(fig, fa));
    crops.append(
      el("figure", { class: "crop", title: `${tVal(fa.sex)} · conf ${fa.conf != null ? fa.conf.toFixed(2) : "—"} · ${fa.sources.join("+")}`,
        onclick: () => openViewer(GVIEW, gi) },
        el("img", { class: "crop-img", src: fa.thumb, loading: "lazy", alt: "顔領域" }))
    );
  }

  const links = el("div", { class: "fig-links" },
    el("a", { href: fig.viewer, target: "_blank", rel: "noopener", onclick: (e) => e.stopPropagation() }, t("gallery.ndl")),
    el("a", { href: viewerUrl(fig.work_file, annoOpts), target: "_blank", rel: "noopener", onclick: (e) => e.stopPropagation() }, t("gallery.anno")));

  row.append(orig, el("div", { class: "fig-right" }, crops, links));
  return row;
}

init();
