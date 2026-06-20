// 顔領域ビューア — 同一画面の <dialog> に OpenSeadragon を出し、原本(IIIF)の
// 該当領域へズーム表示する。search(顔カード)・gallery(顔crop)から共通利用。
// 別タブの IIIF Curation Viewer は「全顔を一覧 / フルで開く」の任意導線として残す。
//
// 各エントリは descriptor を渡す:
//   { pid, rid, pct:[x,y,w,h], title, theme, creator, conf, sex, viewer, full, workFile, pos }
// pct は %(IIIF region と同じ)。pid/rid/pct は full URL からも復元できる(fromFull)。
import { t, tVal } from "./site.js";

const IIIF = "https://dl.ndl.go.jp/api/iiif";
const CURATION_VIEWER = new URL("vendor/iiif-curation-viewer/index.html", location.href).href;

// full/thumb の IIIF URL から {pid, rid, pct} を復元(gallery の crop 用)。
const REGION_RE = /\/iiif\/([^/]+)\/([^/]+)\/pct:([\d.]+),([\d.]+),([\d.]+),([\d.]+)\//;
export function fromFull(url) {
  const m = REGION_RE.exec(url || "");
  if (!m) return null;
  return { pid: m[1], rid: m[2], pct: [+m[3], +m[4], +m[5], +m[6]] };
}

let dlg, osd, stage, ui = {};
let items = [], idx = 0;

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

function build() {
  if (dlg) return;
  stage = el("div", { class: "osd-stage", id: "osd-stage" });
  ui.counter = el("span", { class: "osd-counter" });
  ui.prev = el("button", { class: "osd-nav-btn osd-prev", "aria-label": t("viewer.prev"), onclick: () => go(idx - 1) }, "‹");
  ui.next = el("button", { class: "osd-nav-btn osd-next", "aria-label": t("viewer.next"), onclick: () => go(idx + 1) }, "›");
  const close = el("button", { class: "osd-close", "aria-label": t("viewer.close"), onclick: () => dlg.close() }, "×");
  ui.title = el("div", { class: "osd-title" });
  ui.sub = el("div", { class: "osd-sub" });
  ui.ndl = el("a", { class: "osd-act", target: "_blank", rel: "noopener" }, "NDL");
  ui.full = el("a", { class: "osd-act", target: "_blank", rel: "noopener" }, t("viewer.full"));
  ui.all = el("button", { class: "osd-act", onclick: openAll }, t("viewer.allFaces"));

  dlg = el("dialog", { class: "osd-dialog", "aria-label": t("viewer.title") },
    el("div", { class: "osd-bar" }, close, ui.counter, el("span", { class: "osd-nav" }, ui.prev, ui.next)),
    stage,
    el("div", { class: "osd-meta" },
      el("div", { class: "osd-text" }, ui.title, ui.sub),
      el("div", { class: "osd-actions" }, ui.ndl, ui.full, ui.all)),
  );
  document.body.append(dlg);

  // backdrop クリック(ダイアログ自身=外周)で閉じる
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(idx - 1);
    else if (e.key === "ArrowRight") go(idx + 1);
  });
  dlg.addEventListener("close", () => { if (osd) osd.close(); });

  osd = OpenSeadragon({
    element: stage,
    showNavigationControl: false,
    showNavigator: false,
    visibilityRatio: 1,
    minZoomImageRatio: 0.5,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
    immediateRender: true,
  });
  osd.addHandler("open", fitCurrent);
}

// 現在の descriptor の顔領域へフィット + 矩形ハイライト
function fitCurrent() {
  const d = items[idx];
  const it = osd.world.getItemAt(0);
  if (!it) return;
  const sz = it.getContentSize();
  const px = new OpenSeadragon.Rect(
    d.pct[0] / 100 * sz.x, d.pct[1] / 100 * sz.y,
    d.pct[2] / 100 * sz.x, d.pct[3] / 100 * sz.y);
  const vr = osd.viewport.imageToViewportRectangle(px);
  osd.clearOverlays();
  osd.addOverlay({ element: el("div", { class: "osd-hl" }), location: vr });
  // 顔の周囲に余白を取って文脈ごと見せる
  const m = 0.9;
  const pad = new OpenSeadragon.Rect(
    vr.x - vr.width * m / 2, vr.y - vr.height * m / 2,
    vr.width * (1 + m), vr.height * (1 + m));
  osd.viewport.fitBounds(pad, true);
}

function paint() {
  const d = items[idx];
  ui.counter.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : "";
  ui.prev.disabled = idx <= 0;
  ui.next.disabled = idx >= items.length - 1;
  ui.title.textContent = d.title || t("viewer.untitled");
  const bits = [tVal(d.theme), d.creator, d.sex && d.sex !== "不明" ? tVal(d.sex) : null,
    d.conf != null ? `conf ${d.conf.toFixed(2)}` : null].filter(Boolean);
  ui.sub.textContent = bits.join(" · ");
  ui.ndl.href = d.viewer || `https://dl.ndl.go.jp/pid/${d.pid}`;
  ui.full.href = d.full;
  ui.all.hidden = !d.workFile;
  osd.open(`${IIIF}/${d.pid}/${d.rid}/info.json`);
}

function go(i) {
  if (i < 0 || i >= items.length || i === idx) return;
  idx = i;
  paint();
}

function openAll() {
  const d = items[idx];
  if (!d.workFile) return;
  const u = `${CURATION_VIEWER}?curation=${encodeURIComponent(new URL(d.workFile, location.href).href)}&mode=annotation`;
  window.open(u, "_blank", "noopener");
}

// items: descriptor 配列 / start: 開く位置
export function openViewer(list, start = 0) {
  build();
  items = list;
  idx = Math.max(0, Math.min(start, list.length - 1));
  if (!dlg.open) dlg.showModal();
  paint();
}
