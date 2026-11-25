(() => {
  "use strict";

  // ---------------------------------------------------------------- map
  // dir: side of the circle where the label sits (r = right, l = left, t = top, b = bottom)
  const DISTRICTS = [
    { id: "Chottogram", en: "Chattogram", bn: "চট্টগ্রাম", lat: 22.3758, lon: 91.8317, dir: "b" },
    { id: "Barishal", en: "Barishal", bn: "বরিশাল", lat: 22.7016, lon: 90.3535, dir: "l" },
    { id: "Rangpur", en: "Rangpur", bn: "রংপুর", lat: 25.7491, lon: 89.2597, dir: "r" },
    { id: "Noakhali", en: "Noakhali", bn: "নোয়াখালী", lat: 22.8634, lon: 91.0960, dir: "t" },
    { id: "Mymensingh", en: "Mymensingh", bn: "ময়মনসিংহ", lat: 24.7461, lon: 90.4175, dir: "r" },
    { id: "Tangail", en: "Tangail", bn: "টাঙ্গাইল", lat: 24.2514, lon: 89.9197, dir: "r" },
    { id: "Jamalpur", en: "Jamalpur", bn: "জামালপুর", lat: 24.9253, lon: 89.9485, dir: "l" },
    { id: "Natore", en: "Natore", bn: "নাটোর", lat: 24.4102, lon: 88.9897, dir: "b" },
  ];
  const FRAME = { latMin: 21.7, latMax: 26.3, lonMin: 88.3, lonMax: 92.5 };
  const W = 400, H = 470, PAD = 36;
  const kx = Math.cos((24 * Math.PI) / 180);
  const spanX = (FRAME.lonMax - FRAME.lonMin) * kx, spanY = FRAME.latMax - FRAME.latMin;
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const px = lon => PAD + (lon - FRAME.lonMin) * kx * scale;
  const py = lat => PAD + (FRAME.latMax - lat) * scale;
  const BASE_R = 6;
  const svgNS = "http://www.w3.org/2000/svg";
  const map = document.getElementById("map");

  function el(name, attrs, parent) {
    const e = document.createElementNS(svgNS, name);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  function drawMap() {
    const g = el("g", {}, map);
    for (let lat = 22; lat <= 26; lat += 1) {
      el("line", { x1: px(FRAME.lonMin), x2: px(FRAME.lonMax), y1: py(lat), y2: py(lat), class: "grat" }, g);
      const t = el("text", { x: px(FRAME.lonMin) - 4, y: py(lat) + 4, "text-anchor": "end", class: "grat-label" }, g);
      t.textContent = `${lat}°N`;
    }
    for (let lon = 89; lon <= 92; lon += 1) {
      el("line", { x1: px(lon), x2: px(lon), y1: py(FRAME.latMax), y2: py(FRAME.latMin), class: "grat" }, g);
      const t = el("text", { x: px(lon), y: py(FRAME.latMin) + 16, "text-anchor": "middle", class: "grat-label" }, g);
      t.textContent = `${lon}°E`;
    }
    for (const d of DISTRICTS) {
      const x = px(d.lon), y = py(d.lat);
      const grp = el("g", { class: "district", "data-id": d.id }, map);
      el("circle", { class: "ring", cx: x, cy: y, r: BASE_R + 5 }, grp);
      el("circle", { class: "dot", cx: x, cy: y, r: BASE_R }, grp);
      const bn = el("text", { class: "bn", lang: "bn" }, grp);
      bn.textContent = d.bn;
      const en = el("text", { class: "en" }, grp);
      en.textContent = d.en;
      const pct = el("text", { class: "pct" }, grp);
      pct.textContent = "";
      d.x = x; d.y = y;
      d.node = grp;
      placeLabel(d, BASE_R, false);
    }
  }

  // keep each label just outside its circle, whatever the circle's size
  function placeLabel(d, r, showPct) {
    const gap = 6;
    const lines = showPct ? 3 : 2;                       // Bangla name, English name, percentage
    const block = 15 + 13 * (lines - 1);
    let x = d.x, y, anchor = "middle";
    if (d.dir === "r") { x = d.x + r + gap; anchor = "start"; y = d.y - block / 2 + 12; }
    else if (d.dir === "l") { x = d.x - r - gap; anchor = "end"; y = d.y - block / 2 + 12; }
    else if (d.dir === "t") { y = d.y - r - gap - block + 12; }
    else { y = d.y + r + gap + 12; }
    const [bn, en, pc] = ["text.bn", "text.en", "text.pct"].map(q => d.node.querySelector(q));
    for (const [t, dy] of [[bn, 0], [en, 13], [pc, 26]]) {
      t.setAttribute("x", x.toFixed(1)); t.setAttribute("y", (y + dy).toFixed(1)); t.setAttribute("text-anchor", anchor);
    }
  }

  function updateMap(scores, unknown) {
    map.classList.toggle("unknown", !!unknown);
    const byId = Object.fromEntries(scores.map(s => [s.id, s.probability]));
    const top = scores[0].id;
    for (const d of DISTRICTS) {
      const p = byId[d.id] || 0;
      const r = BASE_R + 26 * Math.sqrt(p);
      d.node.querySelector("circle.dot").setAttribute("r", r.toFixed(1));
      d.node.querySelector("circle.ring").setAttribute("r", (r + 5).toFixed(1));
      d.node.classList.toggle("top", d.id === top);
      const show = p >= 0.05;
      d.node.querySelector("text.pct").textContent = show ? `${Math.round(p * 100)}%` : "";
      placeLabel(d, r, show);
    }
  }

  // ---------------------------------------------------------------- results
  const $ = id => document.getElementById(id);
  const pct = p => `${(p * 100).toFixed(p >= 0.995 || p < 0.1 ? 1 : 0)}%`;

  const CHIP_TEXT = {
    confident: () => "Confident",
    unsure: min => `Unsure: below ${Math.round(min * 100)}% confidence`,
    unknown_voice: () => "Unknown voice",
  };

  function renderTask(task, data, minConf, listLimit) {
    const top = data.scores[0];
    $(`${task}-bn`).textContent = data.status === "unknown_voice" ? "অনির্ধারিত" : (top.bn || "");
    $(`${task}-en`).textContent = data.status === "unknown_voice" ? `Closest: ${top.en} (${pct(top.probability)})` : `${top.en}, ${pct(top.probability)}`;
    const chip = $(`${task}-chip`);
    chip.className = `chip ${data.status}`;
    chip.textContent = CHIP_TEXT[data.status](minConf);
    $(`${task}-chip`).closest(".panel").classList.toggle("is-unsure", data.status !== "confident");
    const list = $(`${task}-list`);
    list.innerHTML = "";
    for (const s of data.scores.slice(0, listLimit)) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="name"></span><span class="bar" role="presentation"><span></span></span><span class="val"></span>`;
      li.querySelector(".name").textContent = s.en;
      li.querySelector(".bar span").style.width = `${(s.probability * 100).toFixed(1)}%`;
      li.querySelector(".val").textContent = pct(s.probability);
      li.setAttribute("aria-label", `${s.en}: ${pct(s.probability)}`);
      list.appendChild(li);
    }
  }

  function showResult(r) {
    const minConf = (window.__calibration && window.__calibration.min_confidence) || { dialect: 0.6, gender: 0.65, age: 0.6 };
    $("results").hidden = false;
    const line = $("status-line");
    line.classList.remove("error");
    const skipped = (r.audio.windows_total || r.audio.windows) - r.audio.windows;
    line.textContent = `Analysed ${r.audio.seconds} s of audio in ${r.audio.windows} window${r.audio.windows > 1 ? "s" : ""}` +
      (skipped > 0 ? ` (${skipped} mostly silent window${skipped > 1 ? "s" : ""} left out)` : "") + ` in ${r.seconds_to_predict} s.`;
    const unknown = r.dialect.status === "unknown_voice";
    const alert = $("voice-alert");
    alert.hidden = !unknown;
    if (unknown) {
      alert.innerHTML = "<strong>Unknown voice.</strong> " + (window.__unknownText ||
        "This voice is not like any of the nine RBVD speakers the dialect model learned from, so the dialect answer is not reliable.") +
        " The map shows the model's raw scores for reference. Gender and age are not affected by this check.";
    }
    renderTask("dialect", r.dialect, minConf.dialect, 3);
    renderTask("gender", r.gender, minConf.gender, 2);
    renderTask("age", r.age, minConf.age, 3);
    updateMap(r.dialect.scores, unknown);
  }

  function showError(msg) {
    $("results").hidden = false;
    const line = $("status-line");
    line.classList.add("error");
    line.textContent = msg;
    $("voice-alert").hidden = true;
  }

  // ---------------------------------------------------------------- sending audio
  let busy = false;
  async function analyse(blob, filename) {
    if (busy) return;
    busy = true;
    setBusy(true);
    $("clip").hidden = false;
    $("clip-audio").src = URL.createObjectURL(blob);
    $("clip-name").textContent = filename;
    $("results").hidden = false;
    const line = $("status-line");
    line.classList.remove("error");
    line.textContent = "Analysing the clip…";
    try {
      const fd = new FormData();
      fd.append("audio", blob, filename);
      const res = await fetch("/api/predict", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `The server answered with error ${res.status}.`);
      showResult(body);
      $("results").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    } catch (e) {
      showError(e.message || "The clip could not be analysed. Check that the server is running and try again.");
    } finally {
      busy = false;
      setBusy(false);
    }
  }

  function setBusy(on) {
    for (const id of ["file-input", "sample-select"]) { const e = $(id); if (e) e.disabled = on; }
    if (!recording) $("record-btn").disabled = on;
  }

  // ---------------------------------------------------------------- recording
  let recorder = null, chunks = [], recording = false, timer = null, startedAt = 0;
  const MAX_REC_MS = 30000;

  function pickMime() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    return types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showError("This browser cannot record audio. Upload a recording instead.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false } });
    } catch (e) {
      showError("Microphone access was blocked. Allow the microphone in the browser's address bar, or upload a recording.");
      return;
    }
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const type = recorder.mimeType || "audio/webm";
      const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
      analyse(new Blob(chunks, { type }), `recording.${ext}`);
    };
    recorder.start();
    recording = true;
    startedAt = Date.now();
    $("record-btn").setAttribute("aria-pressed", "true");
    tick();
    timer = setInterval(tick, 250);
  }

  function tick() {
    const s = (Date.now() - startedAt) / 1000;
    $("record-label").textContent = `Stop recording (${s.toFixed(0)} s)`;
    if (s * 1000 >= MAX_REC_MS) stopRecording();
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    clearInterval(timer);
    $("record-btn").setAttribute("aria-pressed", "false");
    $("record-label").textContent = "Record your voice";
    recorder.stop();
  }

  $("record-btn").addEventListener("click", () => (recording ? stopRecording() : startRecording()));

  $("file-input").addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) analyse(f, f.name);
    e.target.value = "";
  });

  $("sample-select").addEventListener("change", async e => {
    const name = e.target.value;
    if (!name) return;
    const res = await fetch(`/samples/${encodeURIComponent(name)}`);
    if (!res.ok) { showError("That sample could not be loaded."); return; }
    analyse(await res.blob(), name);
  });

  // Text about the model comes from model/calibration.json when the training notebook wrote it,
  // so swapping in a newer model also updates the model card. Without it, the HTML defaults stay.
  function applyModelText(info) {
    const card = info.model_card;
    if (card && Array.isArray(card.rows) && card.rows.length) {
      const table = document.querySelector("#model table");
      if (card.caption) table.querySelector("caption").textContent = card.caption;
      const tbody = table.querySelector("tbody");
      tbody.replaceChildren(...card.rows.map(row => {
        const tr = document.createElement("tr");
        for (const cell of row) { const td = document.createElement("td"); td.textContent = cell; tr.appendChild(td); }
        return tr;
      }));
      if (card.description) document.querySelector("#model > p").textContent = card.description;
    }
    if (Array.isArray(info.limits) && info.limits.length) {
      const grid = document.querySelector("#limits .limits-grid");
      grid.replaceChildren(...info.limits.map(l => {
        const div = document.createElement("div");
        const h = document.createElement("h3"); h.textContent = l.title;
        const p = document.createElement("p"); p.textContent = l.text;
        div.append(h, p);
        return div;
      }));
    }
  }

  // ---------------------------------------------------------------- start-up
  drawMap();
  fetch("/api/info").then(r => r.json()).then(info => {
    window.__calibration = info.calibration_detail || null;
    window.__unknownText = info.unknown_voice_text || null;
    applyModelText(info);
    if (info.samples && info.samples.length) {
      const sel = $("sample-select");
      for (const s of info.samples) {
        const o = document.createElement("option");
        o.value = s; o.textContent = s.replace(/\.[^.]+$/, "").replace(/_/g, " ");
        sel.appendChild(o);
      }
      $("sample-row").hidden = false;
    }
    const note = $("calibration-note");
    note.textContent = info.unknown_voice_check
      ? `Confidence calibration: ${info.calibration}. The unknown-voice check is on.`
      : `Confidence calibration: ${info.calibration}. The unknown-voice check is not set up on this server.`;
  }).catch(() => {});
})();
