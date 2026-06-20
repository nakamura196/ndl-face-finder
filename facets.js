// 共有ファセット — 検索(search/顔単位)と図版一覧(gallery/図版単位)で共通の絞り込みUI。
// 各ページは accessor(item, key) で「その項目が持つ値の配列」を返すだけでよい。
// 値の照合は原語(日本語)で行い、表示だけ tVal で訳す。
import { t, tVal } from "./site.js";

export const FACET_DEFS = [
  { key: "collection", i18n: "facet.collection" },
  { key: "theme", i18n: "facet.theme" },
  { key: "creator", i18n: "facet.creator" },
  { key: "era", i18n: "facet.era" },
  { key: "sex", i18n: "facet.sex" },
  { key: "conf_bucket", i18n: "facet.conf" },
  { key: "source", i18n: "facet.source" },
];

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

// conf(数値) → バケットラベル。faces.json の conf_bucket と完全一致させる。
export function confBucket(conf) {
  if (conf == null) return null;
  if (conf >= 0.8) return "高 (0.8+)";
  if (conf >= 0.65) return "中 (0.65–0.8)";
  return "低 (–0.65)";
}

export function makeSelections() {
  const s = {};
  for (const d of FACET_DEFS) s[d.key] = new Set();
  return s;
}
export function selectionsFromParams(sel, params) {
  for (const d of FACET_DEFS) {
    const v = params.get(d.key);
    if (v) v.split(",").forEach((x) => sel[d.key].add(x));
  }
}
export function selectionsToParams(sel, params) {
  for (const d of FACET_DEFS) if (sel[d.key].size) params.set(d.key, [...sel[d.key]].join(","));
}
export function clearSelections(sel) {
  for (const d of FACET_DEFS) sel[d.key].clear();
}

// 件数集計。1項目が同一値を複数持っても 1 と数える(図版が複数顔を持つケースで重複を防ぐ)。
function countValues(list, accessor) {
  const counts = {};
  for (const d of FACET_DEFS) counts[d.key] = {};
  for (const item of list) {
    for (const d of FACET_DEFS) {
      const vals = new Set(accessor(item, d.key).filter((v) => v != null));
      for (const v of vals) counts[d.key][v] = (counts[d.key][v] || 0) + 1;
    }
  }
  return counts;
}

// item が現在の絞り込みに一致するか(ファセット内は OR、ファセット間は AND)。
export function matches(item, sel, accessor) {
  for (const d of FACET_DEFS) {
    if (sel[d.key].size === 0) continue;
    if (!accessor(item, d.key).some((v) => sel[d.key].has(v))) return false;
  }
  return true;
}

// 全件 allItems からファセットUI(チェックボックス群)を描画。onChange は値変更時に呼ぶ。
export function renderFacets(container, { allItems, sel, accessor, onChange }) {
  container.innerHTML = "";
  const counts = countValues(allItems, accessor);
  for (const d of FACET_DEFS) {
    const entries = Object.entries(counts[d.key]).sort((a, b) => b[1] - a[1]);
    if (!entries.length) continue;
    const group = el("div", { class: "facet-group" }, el("h3", {}, t(d.i18n)));
    for (const [val, n] of entries) {
      const id = `f-${d.key}-${val}`;
      const cb = el("input", { type: "checkbox", id });
      cb.checked = sel[d.key].has(val);
      cb.addEventListener("change", () => {
        cb.checked ? sel[d.key].add(val) : sel[d.key].delete(val);
        onChange();
      });
      group.append(
        el("label", { class: "facet-opt", for: id, "data-key": d.key, "data-val": val },
          cb, el("span", { class: "lbl" }, tVal(val)), el("span", { class: "n" }, String(n)))
      );
    }
    container.append(group);
  }
}

// 絞り込み後リストで各ファセット値の件数を更新し、0件は淡色化(.off)。
export function updateAvailability(container, list, sel, accessor) {
  const counts = countValues(list, accessor);
  for (const d of FACET_DEFS) {
    container.querySelectorAll(`.facet-opt[data-key="${d.key}"]`).forEach((opt) => {
      const v = opt.dataset.val;
      const n = counts[d.key][v] || 0;
      opt.querySelector(".n").textContent = String(n);
      opt.classList.toggle("off", n === 0 && !sel[d.key].has(v));
    });
  }
}
