// 近現代美人画 顔ファインダー(検索) — vanilla JS
// faces.json を読み、ファセット絞り込み + 作品別 curation を Curation Viewer で開く。
// ファセット状態は GET パラメータ(?theme=…&sex=…&q=…)に同期し、URL で共有できる。

import { t, tVal, onLang } from "./site.js";
import {
  makeSelections, selectionsFromParams, selectionsToParams, clearSelections,
  matches, renderFacets, updateAvailability,
} from "./facets.js";

// 顔1件が各ファセットで持つ値。source(検出器)のみ複数値。
const faceAccessor = (f, key) => (key === "source" ? f.sources : [f[key]]);

// viewer は同梱(codh-mirror の IIIF Curation Viewer, MIT)。常に同一オリジンで開くので
// ローカル(HTTP)でも公開(HTTPS)でも mixed-content が起きず、curation を読み込める。
const CURATION_VIEWER = new URL("vendor/iiif-curation-viewer/index.html", location.href).href;

const state = {
  faces: [], meta: null, works: [],
  facetSel: makeSelections(), q: "",
};

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const c of kids) n.append(c?.nodeType ? c : document.createTextNode(c));
  return n;
};

// opts.pos: キュレーションビューで特定の顔(1-based)へ / opts.mode:'annotation' で一覧閲覧
function viewerUrl(file, opts = {}) {
  const abs = new URL(file, location.href).href;
  let u = `${CURATION_VIEWER}?curation=${encodeURIComponent(abs)}`;
  if (opts.mode) u += `&mode=${opts.mode}`;
  if (opts.pos) u += `&pos=${opts.pos}`;
  return u;
}
const openCuration = (file, opts) => window.open(viewerUrl(file, opts), "_blank", "noopener");

/* ---- GET パラメータ同期 ---- */
function stateFromUrl() {
  const p = new URLSearchParams(location.search);
  selectionsFromParams(state.facetSel, p);
  state.q = p.get("q") || "";
}
function syncUrl() {
  const p = new URLSearchParams();
  selectionsToParams(state.facetSel, p);
  if (state.q.trim()) p.set("q", state.q.trim());
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

async function init() {
  const [faces, meta, cur] = await Promise.all([
    fetch("data/faces.json").then((r) => r.json()),
    fetch("data/meta.json").then((r) => r.json()),
    fetch("curations/index.json").then((r) => r.json()).catch(() => ({ works: [] })),
  ]);
  state.faces = faces;
  state.meta = meta;
  state.works = cur.works || [];
  $("#total-count").textContent = meta.total;
  stateFromUrl();
  $("#q").value = state.q;
  drawFacets();
  bindUI();
  render();
  // 言語切替で動的部分を再描画(facet見出し・値・カード・Curation List)
  onLang(() => { drawFacets(); render(); });
}

function drawFacets() {
  renderFacets($("#facet-groups"), {
    allItems: state.faces,
    sel: state.facetSel,
    accessor: faceAccessor,
    onChange: () => { syncUrl(); render(); },
  });
}

function filtered() {
  const q = state.q.trim();
  return state.faces.filter((f) => {
    if (!matches(f, state.facetSel, faceAccessor)) return false;
    if (q && !((f.title || "").includes(q) || (f.theme || "").includes(q))) return false;
    return true;
  });
}

function render() {
  const list = filtered();
  $("#result-count").textContent = list.length;
  const grid = $("#grid");
  grid.innerHTML = "";
  $("#empty").hidden = list.length > 0;
  const frag = document.createDocumentFragment();
  for (const f of list) frag.append(card(f));
  grid.append(frag);
  updateAvailability($("#facet-groups"), list, state.facetSel, faceAccessor);
  renderWorkList(list);
}

function card(f) {
  const node = el("div", { class: "card", title: t("search.cardTitle") });
  node.append(
    el("img", { class: "thumb", src: f.thumb, loading: "lazy", alt: f.title, width: "360", height: "360" }),
    el("div", { class: "badge-iiif" }, "IIIF"),
    el("div", { class: "links" },
      el("a", { href: f.viewer, target: "_blank", rel: "noopener", title: "NDLデジコレで見る",
        onclick: (e) => e.stopPropagation() }, "NDL"),
      el("a", { href: f.full, target: "_blank", rel: "noopener", title: "原寸の顔領域",
        onclick: (e) => e.stopPropagation() }, "原寸")),
    el("div", { class: "meta" },
      el("div", { class: "t", title: f.title }, f.title || "(無題)"),
      el("div", { class: "sub" }, el("span", {}, tVal(f.theme)), el("span", {}, tVal(f.sex))))
  );
  // クリック = この特定の顔を拡大表示(キュレーションビュー + pos)
  node.addEventListener("click", () =>
    openCuration(`curations/works/${f.theme_key}.json`, { pos: f.cur_pos }));
  return node;
}

// 右パネル: 現在の絞り込みに該当する作品 curation。クリックで Viewer。
function renderWorkList(list) {
  const present = {};
  for (const f of list) present[f.theme] = (present[f.theme] || 0) + 1;
  const box = $("#worklist");
  box.innerHTML = "";
  const rows = state.works.map((w) => ({ ...w, hit: present[w.title] || 0 })).filter((w) => w.hit > 0);
  if (rows.length === 0) {
    box.append(el("p", { class: "hint" }, t("search.noWork")));
    return;
  }
  for (const w of rows) {
    box.append(
      el("button", { class: "work-row", title: `アノテーションモードで開く: ${w.title}`,
        onclick: () => openCuration(w.file, { mode: "annotation" }) },
        el("span", { class: "w-title" }, w.title),
        el("span", { class: "w-meta" }, `${w.hit}/${w.count}顔`),
        el("span", { class: "w-open" }, "↗"))
    );
  }
}

function bindUI() {
  $("#q").addEventListener("input", (e) => {
    state.q = e.target.value;
    syncUrl();
    render();
  });
  $("#clear-facets").addEventListener("click", () => {
    clearSelections(state.facetSel);
    document.querySelectorAll(".facet-opt input").forEach((c) => (c.checked = false));
    state.q = "";
    $("#q").value = "";
    syncUrl();
    render();
  });
}

init();
