/* Small SVG chart kit for the research pages. Each chart: legend (2+ series), hover tooltip, "Show the numbers" table.
   Series colours come from CSS variables --s1..--s3 (validated for colour-blind separation on the page colour). */
window.Charts = (() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const SERIES = () => [css("--s1"), css("--s2"), css("--s3")];

  const STYLE_ATTRS = new Set(["fill", "font-size", "font-weight"]);   // page CSS would override these as attributes
  function S(name, attrs, parent, text) {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null) continue;
      if (name === "text" && STYLE_ATTRS.has(k)) e.style.setProperty(k, k === "font-size" ? `${v}px` : String(v));
      else e.setAttribute(k, v);
    }
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function H(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  const fmt = {
    percent: v => v == null ? "–" : `${(v * 100).toFixed(1)}%`,
    percent0: v => v == null ? "–" : `${Math.round(v * 100)}%`,
    decimal: v => v == null ? "–" : v.toFixed(3),
    decimal2: v => v == null ? "–" : v.toFixed(2),
    points: v => v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}`,
    int: v => v == null ? "–" : Math.round(v).toLocaleString("en-US"),
  };

  // ------------------------------------------------------------- tooltip
  const tip = () => document.getElementById("tip");
  function showTip(evt, html) {
    const t = tip();
    t.innerHTML = html;
    t.hidden = false;
    const pad = 14, r = t.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${Math.max(8, y)}px`;
  }
  function hideTip() { tip().hidden = true; }
  function hover(node, html) {
    node.addEventListener("pointermove", e => showTip(e, typeof html === "function" ? html(e) : html));
    node.addEventListener("pointerleave", hideTip);
  }
  const sw = c => `<span class="sw" style="background:${c}"></span>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ------------------------------------------------------------- shared parts
  function legend(el, series, kind) {
    if (series.length < 2) return;
    const d = H("div", { class: "legend" }, el);
    series.forEach(s => {
      const sp = H("span", {}, d);
      const i = H("i", { class: kind || "" }, sp);
      i.style.background = s.color;
      sp.append(s.name);
    });
  }
  function table(el, caption, head, rows, numericFrom = 1) {
    const btn = H("button", { class: "btn show-table", type: "button", "aria-expanded": "false" }, el, "Show the numbers");
    const wrap = H("div", { class: "table-wrap data-table", hidden: "" }, el);
    const t = H("table", {}, wrap);
    H("caption", {}, t, caption);
    const tr = H("tr", {}, H("thead", {}, t));
    head.forEach((h, i) => H("th", { scope: "col", class: i >= numericFrom ? "n" : "" }, tr, h));
    const tb = H("tbody", {}, t);
    rows.forEach(r => {
      const row = H("tr", {}, tb);
      r.forEach((c, i) => H(i === 0 ? "th" : "td", i === 0 ? { scope: "row" } : { class: i >= numericFrom ? "n" : "" }, row, c));
    });
    btn.addEventListener("click", () => {
      const open = wrap.hidden;
      wrap.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "Hide the numbers" : "Show the numbers";
    });
  }
  function svgFor(el, w, h, label) {
    return S("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": label }, el);
  }
  // bar with a 4px rounded data end and a square baseline end
  function barPath(x0, y, x1, h) {
    const r = Math.min(4, h / 2, Math.max(0, x1 - x0));
    return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
  }
  const niceTicks = (lo, hi, n) => {
    const step = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1].find(s => (hi - lo) / s <= n) || 1;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(4));
    return out;
  };

  // ------------------------------------------------------------- horizontal grouped bars
  function hbars(el, o) {
    el.innerHTML = "";
    const cols = SERIES();
    const series = o.series.map((s, i) => ({ ...s, color: s.color || cols[i] }));
    legend(el, series);
    const W = Math.max(320, el.clientWidth || 640), narrow = W < 560;
    const L = narrow ? 112 : (o.labelWidth || 170), R = 64, bh = 12, gap = 2, rowGap = 16, top = 24;
    const rowH = series.length * bh + (series.length - 1) * gap;
    const Hh = top + o.rows.length * (rowH + rowGap) + 6;
    const svg = svgFor(el, W, Hh, o.label);
    const max = o.max || 1, x = v => L + (W - L - R) * Math.max(0, v) / max;
    niceTicks(0, max, narrow ? 4 : 5).forEach(t => {
      S("line", { class: "gridline", x1: x(t), x2: x(t), y1: top - 6, y2: Hh - 4 }, svg);
      S("text", { x: x(t), y: top - 10, "text-anchor": "middle" }, svg, o.tick ? o.tick(t) : fmt.percent0(t));
    });
    o.rows.forEach((row, ri) => {
      const y0 = top + ri * (rowH + rowGap) + rowGap / 2;
      const lab = S("text", { class: "lab", x: L - 10, y: y0 + rowH / 2 + (row.sub ? -2 : 4), "text-anchor": "end" }, svg, row.label);
      if (row.sub) S("text", { x: L - 10, y: y0 + rowH / 2 + 13, "text-anchor": "end", "font-size": "11.5" }, svg, row.sub);
      series.forEach((s, si) => {
        const v = row.values[si], y = y0 + si * (bh + gap);
        if (v == null) return;
        S("path", { d: barPath(x(0), y, Math.max(x(0) + 1, x(v)), bh), fill: s.color }, svg);
        S("text", { class: "val", x: x(v) + 6, y: y + bh - 2 }, svg, (o.format || fmt.percent)(v));
        const hit = S("rect", { class: "hit", x: L, y: y - 1, width: W - L, height: bh + 2 }, svg);
        hover(hit, `<b>${esc(row.label)}</b><br>${sw(s.color)}${esc(s.name)}: ${(o.format || fmt.percent)(v)}${row.tipExtra ? `<br>${esc(row.tipExtra)}` : ""}`);
      });
    });
    S("line", { class: "axis", x1: x(0), x2: x(0), y1: top - 6, y2: Hh - 4 }, svg);
    (o.refs || []).forEach(r => {
      S("line", { class: "ref", x1: x(r.value), x2: x(r.value), y1: top - 4, y2: Hh - 4 }, svg);
      S("text", { x: x(r.value) + 4, y: Hh - 6, "font-size": "11.5" }, svg, r.label);
    });
    table(el, o.label, ["", ...series.map(s => s.name), ...(o.extraCols || []).map(c => c.name)],
      o.rows.map(r => [r.label, ...r.values.map(v => (o.format || fmt.percent)(v)), ...(o.extraCols || []).map(c => c.get(r))]));
  }

  // ------------------------------------------------------------- dot plot (models x tests)
  function dots(el, o) {
    el.innerHTML = "";
    const cols = SERIES();
    const series = o.series.map((s, i) => ({ ...s, color: s.color || cols[i] }));
    legend(el, series, "dot");
    const W = Math.max(320, el.clientWidth || 640), narrow = W < 560;
    const L = narrow ? 120 : 230, R = 24, rowH = narrow ? 40 : 34, top = 26;
    const Hh = top + o.rows.length * rowH + 8;
    const svg = svgFor(el, W, Hh, o.label);
    const [lo, hi] = o.domain, x = v => L + (W - L - R) * (v - lo) / (hi - lo);
    niceTicks(lo, hi, narrow ? 5 : 6).forEach(t => {
      S("line", { class: "gridline", x1: x(t), x2: x(t), y1: top - 6, y2: Hh - 4 }, svg);
      S("text", { x: x(t), y: top - 10, "text-anchor": "middle" }, svg, (o.tick || fmt.percent0)(t));
    });
    (o.refs || []).forEach(r => {
      S("line", { class: "ref", x1: x(r.value), x2: x(r.value), y1: top - 4, y2: Hh - 4 }, svg);
      S("text", { x: x(r.value) + 4, y: Hh - 6, "font-size": "11.5" }, svg, r.label);
    });
    o.rows.forEach((row, ri) => {
      const cy = top + ri * rowH + rowH / 2;
      S("text", { class: "lab", x: L - 12, y: cy + (row.sub && !narrow ? -3 : 4), "text-anchor": "end", "font-weight": row.strong ? 600 : null }, svg, narrow ? row.short || row.label : row.label);
      if (row.sub && !narrow) S("text", { x: L - 12, y: cy + 12, "text-anchor": "end", "font-size": "11.5" }, svg, row.sub);
      const vals = row.values.filter(v => v != null);
      if (vals.length > 1) S("line", { x1: x(Math.min(...vals)), x2: x(Math.max(...vals)), y1: cy, y2: cy, stroke: "#A9B8AD", "stroke-width": 2 }, svg);
      row.values.forEach((v, si) => {
        if (v == null) return;
        const c = S("circle", { cx: x(v), cy, r: 5.5, fill: series[si].color, stroke: css("--paper"), "stroke-width": 2 }, svg);
        const hit = S("circle", { class: "hit", cx: x(v), cy, r: 11 }, svg);
        hover(hit, `<b>${esc(row.label)}</b><br>${sw(series[si].color)}${esc(series[si].name)}: ${(o.format || fmt.percent)(v)}`);
        void c;
      });
    });
    table(el, o.label, ["Model", ...series.map(s => s.name)], o.rows.map(r => [r.label, ...r.values.map(v => (o.format || fmt.percent)(v))]));
  }

  // ------------------------------------------------------------- differences with 95% ranges
  function ci(el, o) {
    el.innerHTML = "";
    const W = Math.max(320, el.clientWidth || 640), narrow = W < 560;
    const L = narrow ? 8 : 260, R = narrow ? 16 : 150, rowH = narrow ? 52 : 34, top = 26;
    const Hh = top + o.rows.length * rowH + 8;
    const svg = svgFor(el, W, Hh, o.label);
    const m = Math.max(...o.rows.flatMap(r => [Math.abs(r.low), Math.abs(r.high)])) * 1.1;
    const x = v => L + (W - L - R) * (v + m) / (2 * m);
    niceTicks(-m, m, narrow ? 4 : 6).forEach(t => {
      S("line", { class: t === 0 ? "axis" : "gridline", x1: x(t), x2: x(t), y1: top - 6, y2: Hh - 4 }, svg);
      S("text", { x: x(t), y: top - 10, "text-anchor": "middle" }, svg, fmt.points(t));
    });
    const clear = css("--s1"), unclear = "#93A59C";
    o.rows.forEach((row, ri) => {
      const cy = top + ri * rowH + rowH / 2 + (narrow ? 8 : 0), real = row.low > 0 || row.high < 0, c = real ? clear : unclear;
      if (narrow) S("text", { class: "lab", x: 0, y: cy - 12, "text-anchor": "start" }, svg, `${row.label}: ${fmt.points(row.difference)}`);
      else S("text", { class: "lab", x: L - 12, y: cy + 4, "text-anchor": "end" }, svg, row.label);
      S("line", { x1: x(row.low), x2: x(row.high), y1: cy, y2: cy, stroke: c, "stroke-width": 2.5, "stroke-linecap": "round" }, svg);
      S("circle", { cx: x(row.difference), cy, r: 5.5, fill: c, stroke: css("--paper"), "stroke-width": 2 }, svg);
      if (!narrow) S("text", { class: "val", x: W - R + 12, y: cy + 4 }, svg, `${fmt.points(row.difference)} (${fmt.points(row.low)} to ${fmt.points(row.high)})`);
      const hit = S("rect", { class: "hit", x: L, y: cy - rowH / 2, width: W - L, height: rowH }, svg);
      hover(hit, `<b>${esc(row.label)}</b><br>${fmt.points(row.difference)} points; 95% range ${fmt.points(row.low)} to ${fmt.points(row.high)}<br>${real ? "The range excludes zero." : "The range crosses zero."} ${row.speakers} speakers.`);
    });
    table(el, o.label, ["Comparison", "Difference (points)", "95% range", "Speakers"],
      o.rows.map(r => [r.label, fmt.points(r.difference), `${fmt.points(r.low)} to ${fmt.points(r.high)}`, String(r.speakers)]));
  }

  // ------------------------------------------------------------- lines with a crosshair
  function lines(el, o) {
    el.innerHTML = "";
    const cols = SERIES();
    const series = o.series.map((s, i) => ({ ...s, color: s.color || cols[i] }));
    legend(el, series, "line");
    const W = Math.max(300, el.clientWidth || 640), Hh = o.height || 260;
    const L = 46, R = 16, T = 16, B = 40;
    const svg = svgFor(el, W, Hh, o.label);
    const [x0, x1] = o.x.domain, [y0, y1] = o.y.domain;
    const x = v => L + (W - L - R) * (v - x0) / (x1 - x0), y = v => T + (Hh - T - B) * (1 - (v - y0) / (y1 - y0));
    niceTicks(y0, y1, 5).forEach(t => {
      S("line", { class: "gridline", x1: L, x2: W - R, y1: y(t), y2: y(t) }, svg);
      S("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end" }, svg, (o.y.tick || fmt.decimal2)(t));
    });
    (o.x.ticks || niceTicks(x0, x1, 6)).forEach(t => S("text", { x: x(t), y: Hh - B + 18, "text-anchor": "middle" }, svg, (o.x.tick || String)(t)));
    S("line", { class: "axis", x1: L, x2: W - R, y1: Hh - B, y2: Hh - B }, svg);
    S("text", { x: L + (W - L - R) / 2, y: Hh - 4, "text-anchor": "middle" }, svg, o.x.label);
    (o.refs || []).forEach(r => {
      S("line", { class: "ref", x1: L, x2: W - R, y1: y(r.value), y2: y(r.value) }, svg);
      S("text", { x: W - R, y: y(r.value) - 5, "text-anchor": "end", "font-size": "11.5" }, svg, r.label);
    });
    series.forEach(s => {
      const pts = s.points.filter(p => p.y != null);
      S("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(""), fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
      if (pts.length <= 25) pts.forEach(p => S("circle", { cx: x(p.x), cy: y(p.y), r: 4, fill: s.color, stroke: css("--paper"), "stroke-width": 2 }, svg));
    });
    const xs = [...new Set(series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
    const cross = S("line", { x1: 0, x2: 0, y1: T, y2: Hh - B, stroke: "#15302B", "stroke-width": 1, opacity: 0 }, svg);
    const hit = S("rect", { class: "hit", x: L, y: T, width: W - L - R, height: Hh - T - B }, svg);
    hit.addEventListener("pointermove", e => {
      const box = svg.getBoundingClientRect(), px = (e.clientX - box.left) * W / box.width;
      const xv = xs.reduce((a, b) => Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a, xs[0]);
      cross.setAttribute("x1", x(xv)); cross.setAttribute("x2", x(xv)); cross.setAttribute("opacity", .5);
      const rows = series.map(s => { const p = s.points.find(q => q.x === xv); return `${sw(s.color)}${esc(s.name)}: ${p && p.y != null ? (o.y.format || fmt.decimal)(p.y) : "no answers"}`; });
      showTip(e, `<b>${esc(o.x.label)}: ${(o.x.tick || String)(xv)}</b><br>${rows.join("<br>")}`);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); hideTip(); });
    table(el, o.label, [o.x.label, ...series.map(s => s.name)],
      xs.map(xv => [(o.x.tick || String)(xv), ...series.map(s => { const p = s.points.find(q => q.x === xv); return p && p.y != null ? (o.y.format || fmt.decimal)(p.y) : "–"; })]));
  }

  // ------------------------------------------------------------- scatter (single colour)
  function scatter(el, o) {
    el.innerHTML = "";
    const W = Math.max(300, el.clientWidth || 640), Hh = o.height || 340;
    const L = 50, R = 16, T = 18, B = 44;
    const svg = svgFor(el, W, Hh, o.label);
    const [x0, x1] = o.x.domain, [y0, y1] = o.y.domain;
    const x = v => L + (W - L - R) * (v - x0) / (x1 - x0), y = v => T + (Hh - T - B) * (1 - (v - y0) / (y1 - y0));
    (o.bands || []).forEach(b => {
      S("rect", { x: x(b.from), y: T, width: x(Math.min(b.to, x1)) - x(b.from), height: Hh - T - B, fill: css("--shapla-soft") }, svg);
      S("text", { x: x(b.from) + 6, y: T + 14, fill: css("--ink"), "font-size": "12" }, svg, b.label);
    });
    niceTicks(y0, y1, 5).forEach(t => {
      S("line", { class: "gridline", x1: L, x2: W - R, y1: y(t), y2: y(t) }, svg);
      S("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end" }, svg, (o.y.tick || fmt.percent0)(t));
    });
    niceTicks(x0, x1, 7).forEach(t => S("text", { x: x(t), y: Hh - B + 18, "text-anchor": "middle" }, svg, t.toFixed(1)));
    S("line", { class: "axis", x1: L, x2: W - R, y1: Hh - B, y2: Hh - B }, svg);
    S("text", { x: L + (W - L - R) / 2, y: Hh - 6, "text-anchor": "middle" }, svg, o.x.label);
    S("text", { x: 12, y: T + (Hh - T - B) / 2, "text-anchor": "middle", transform: `rotate(-90 12 ${T + (Hh - T - B) / 2})` }, svg, o.y.label);
    (o.refs || []).forEach((r, i) => {
      S("line", { class: "ref", x1: x(r.value), x2: x(r.value), y1: T, y2: Hh - B }, svg);
      S("text", { x: x(r.value) + 5, y: Hh - B - 8 - i * 15, "text-anchor": "start", "font-size": "11.5", fill: css("--ink") }, svg, r.label);
    });
    const c = css("--s1"), maxS = Math.max(...o.points.map(p => p.size));
    [...o.points].sort((a, b) => b.size - a.size).forEach(p => {
      const r = 4 + 9 * Math.sqrt(p.size / maxS);
      S("circle", { cx: x(p.x), cy: y(p.y), r, fill: c, "fill-opacity": .78, stroke: css("--paper"), "stroke-width": 2 }, svg);
      const hit = S("circle", { class: "hit", cx: x(p.x), cy: y(p.y), r: Math.max(r, 9) }, svg);
      hover(hit, p.tip);
    });
    if (o.tableRows) table(el, o.label, o.tableHead, o.tableRows);
  }

  // ------------------------------------------------------------- confusion heatmap (sequential blue)
  function heat(el, o) {
    el.innerHTML = "";
    const W = Math.max(300, el.clientWidth || 640), narrow = W < 560;
    const n = o.labels.length, L = narrow ? 84 : 110, T = narrow ? 84 : 104;
    const cell = Math.min(54, (W - L - 8) / n), Hh = T + n * cell + 34;
    const svg = svgFor(el, W, Hh, o.label);
    const ramp = ["#F3F5F0", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
    S("text", { x: L, y: 14, "text-anchor": "start", fill: css("--ink") }, svg, "Answer given by the app →");
    o.labels.forEach((lab, j) => {
      const cx = L + j * cell + cell / 2;
      S("text", { x: cx, y: T - 8, "text-anchor": "start", transform: `rotate(-40 ${cx} ${T - 8})`, "font-size": narrow ? "10.5" : "12" }, svg, o.short ? o.short(lab) : lab);
    });
    o.matrix.forEach((row, i) => {
      const tot = row.reduce((a, b) => a + b, 0);
      S("text", { class: "lab", x: L - 8, y: T + i * cell + cell / 2 + 4, "text-anchor": "end", "font-size": narrow ? "11" : "13" }, svg, o.short ? o.short(o.labels[i]) : o.labels[i]);
      row.forEach((v, j) => {
        const share = tot ? v / tot : 0, k = v === 0 ? 0 : Math.min(7, 1 + Math.floor(share * 6.999));
        S("rect", { x: L + j * cell + 1, y: T + i * cell + 1, width: cell - 2, height: cell - 2, rx: 3, fill: ramp[k] }, svg);
        if (v) S("text", { x: L + j * cell + cell / 2, y: T + i * cell + cell / 2 + 4, "text-anchor": "middle", fill: k >= 4 ? "#fff" : css("--ink"), "font-size": narrow ? "11" : "13" }, svg, v);
        const hit = S("rect", { class: "hit", x: L + j * cell, y: T + i * cell, width: cell, height: cell }, svg);
        hover(hit, `<b>${esc(o.labels[i])} speaker</b><br>Answered ${esc(o.labels[j])}: ${v} of ${tot} clips (${fmt.percent0(share)})`);
      });
    });
    S("text", { x: 4, y: Hh - 8, "font-size": "12" }, svg, "Rows: the speaker's district. Darker = larger share of that row.");
    table(el, o.label, ["District", ...o.labels.map(l => o.short ? o.short(l) : l)], o.matrix.map((r, i) => [o.labels[i], ...r.map(String)]));
  }

  return { hbars, dots, ci, lines, scatter, heat, fmt, table, esc };
})();
