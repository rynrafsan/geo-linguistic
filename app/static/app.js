(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const C = window.Charts, F = C.fmt, esc = C.esc;
  const MAP_NAME = { Chottogram: "Chattogram" };            // model class id -> map district name
  const mapName = id => MAP_NAME[id] || id;
  const MANY_SPEAKERS = new Set(["Chattogram", "Barishal", "Rangpur", "Noakhali", "Tangail"]);
  const STATUS = { confident: "Confident", unsure: "Unsure", unknown_voice: "Unknown voice" };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let MAP = null, RESEARCH = null, INFO = null;
  const load = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });
  const mapReady = load("/web/data/bd_map.json").then(m => { $("map-credit").textContent = `Map: ${m.attribution}`; return (MAP = m); });
  const researchReady = load("/web/data/research.json").then(r => (RESEARCH = r));
  const infoReady = load("/api/info").then(i => (INFO = i)).catch(() => (INFO = {}));

  // ================================================================ router
  const ROUTES = { home: "Geo-Linguistic Audio Analysis", analyze: "Analyze a voice", results: "Results", data: "Data",
                   model: "Model", literature: "Literature", about: "About" };
  const done = new Set();
  const charts = {};            // page -> [render functions], re-run on resize
  let current = null;

  function route() {
    const name = (location.hash.replace(/^#\/?/, "") || "home").split(/[/?]/)[0];
    const page = ROUTES[name] ? name : "home";
    document.querySelectorAll(".page").forEach(s => { s.hidden = s.dataset.page !== page; });
    document.querySelectorAll(".nav a[data-route]").forEach(a =>
      a.dataset.route === page ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    document.title = page === "home" ? ROUTES.home : `${ROUTES[page]} · Geo-Linguistic`;
    setMenu(false);
    if (current !== null) { window.scrollTo(0, 0); $("main").focus({ preventScroll: true }); }
    current = page;
    render(page);
  }

  async function render(page) {
    if (done.has(page)) return;
    done.add(page);
    try {
      await Promise.all([mapReady, researchReady, infoReady]);
      PAGES[page]();
    } catch (e) {
      done.delete(page);
      console.error(e);
      const sec = document.querySelector(`.page[data-page="${page}"]`);
      const p = document.createElement("p");
      p.className = "status error";
      p.textContent = "Some data for this page could not be loaded. Reload the page to try again.";
      sec.appendChild(p);
    }
  }

  function chart(page, fn) {
    (charts[page] = charts[page] || []).push(fn);
    fn();
  }
  let lastW = innerWidth, rt = null;
  addEventListener("resize", () => {
    if (Math.abs(innerWidth - lastW) < 24) return;
    clearTimeout(rt);
    rt = setTimeout(() => { lastW = innerWidth; (charts[current] || []).forEach(f => f()); }, 150);
  });

  // mobile menu
  const nav = document.querySelector(".nav"), menuBtn = document.querySelector(".menu-btn");
  function setMenu(open) { nav.classList.toggle("open", open); menuBtn.setAttribute("aria-expanded", String(open)); menuBtn.textContent = open ? "Close" : "Menu"; }
  menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  document.querySelector(".skip").addEventListener("click", e => { e.preventDefault(); $("main").focus(); });
  addEventListener("hashchange", route);

  // ================================================================ maps
  function drawMap(container, opts) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", MAP.viewBox);
    svg.setAttribute("class", "map");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", opts.label);
    svg.innerHTML = `<defs><pattern id="hatch-${opts.id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill="#D3E0EC"/><line x1="0" y1="0" x2="0" y2="5" stroke="#fff" stroke-width="2"/></pattern></defs>`;
    const gP = document.createElementNS(NS, "g"), gL = document.createElementNS(NS, "g");
    svg.append(gP, gL);
    const paths = {}, labels = {};
    for (const d of MAP.districts) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d.d);
      const cls = opts.classFor(d);
      p.setAttribute("class", cls);
      if (cls === "d-one") p.setAttribute("style", `fill:url(#hatch-${opts.id})`);
      const t = document.createElementNS(NS, "title");
      t.textContent = d.study ? `${d.name} (${d.bn}), study district` : `${d.name} (${d.bn})`;
      p.appendChild(t);
      gP.appendChild(p);
      paths[d.name] = p;
      if (d.study) {
        const l = document.createElementNS(NS, "text");
        l.setAttribute("class", "lbl");
        l.setAttribute("x", d.cx); l.setAttribute("y", d.cy + 3);
        l.textContent = d.name;
        gL.appendChild(l);
        labels[d.name] = l;
      }
    }
    const pin = document.createElementNS(NS, "circle");
    pin.setAttribute("class", "pin"); pin.setAttribute("r", "4.5"); pin.style.display = "none";
    gL.appendChild(pin);
    container.replaceChildren(svg);
    return { svg, paths, labels, pin, gP };
  }

  // ================================================================ home
  function pageHome() {
    drawMap($("home-map"), {
      id: "home", label: "Map of Bangladesh's 64 districts. The eight study districts are highlighted: Chattogram, Barishal, Rangpur, Noakhali and Tangail were learned from many speakers; Mymensingh, Jamalpur and Natore from one speaker each.",
      classFor: d => !d.study ? "d-other" : MANY_SPEAKERS.has(d.name) ? "d-study" : "d-one",
    });
    $("home-figures").replaceChildren(...RESEARCH.headline.map(h => {
      const d = document.createElement("div");
      d.className = "figure";
      d.innerHTML = `<div class="v">${h.format === "percent" ? F.percent(h.value) : h.value.toFixed(h.value > 0.9 ? 3 : 2)}</div>
        <p class="l">${esc(h.label)}</p><div class="d">${esc(h.detail)}</div>`;
      return d;
    }));
    $("home-path").replaceChildren(...RESEARCH.versions.map(v => {
      const li = document.createElement("li");
      li.className = v.status;
      li.innerHTML = `<b>${esc(v.name)}</b><span>${esc(v.short || v.decision)}</span>`;
      return li;
    }));
  }

  // ================================================================ analyze
  let anMap = null, clip = null, busy = false;

  function pageAnalyze() {
    anMap = drawMap($("an-map"), {
      id: "an", label: "Map of Bangladesh with the eight study districts outlined.",
      classFor: d => d.study ? "d-study" : "d-other",
    });
    const list = $("sample-list");
    const samples = (INFO && INFO.samples) || [];
    const byId = Object.fromEntries(((INFO && INFO.dialects) || []).map(d => [d.id, d]));
    list.replaceChildren(...samples.map(s => {
      const li = document.createElement("li"), b = document.createElement("button");
      const d = byId[s.district] || {};
      b.type = "button";
      b.innerHTML = `${esc(d.en || s.district || s.file)}<span class="bn" lang="bn">${esc(d.bn || "")}</span><small>${esc(s.source || "Sample clip")}${s.seconds ? `, ${s.seconds} s` : ""}</small>`;
      b.addEventListener("click", () => useSample(s, d));
      li.appendChild(b);
      return li;
    }));
    if (!samples.length) $("sample-btn").hidden = true;
  }

  $("sample-btn").addEventListener("click", () => {
    const open = $("samples").hidden;
    $("samples").hidden = !open;
    $("sample-btn").setAttribute("aria-expanded", String(open));
  });

  async function useSample(s, d) {
    if (busy) return;
    setStatus("Loading the sample…");
    try {
      const res = await fetch(`/samples/${encodeURIComponent(s.file)}`);
      if (!res.ok) throw new Error();
      $("samples").hidden = true;
      $("sample-btn").setAttribute("aria-expanded", "false");
      setClip(await res.blob(), `${d.en || s.district} sample: ${s.source || s.file}`, s.file);
    } catch { setStatus("That sample could not be loaded.", true); }
  }

  $("file-input").addEventListener("change", e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setStatus("The file is larger than 15 MB. Upload a clip of one minute or less.", true); return; }
    setClip(f, f.name, f.name);
  });

  function setStatus(msg, error) {
    const s = $("status");
    s.textContent = msg || "";
    s.classList.toggle("error", !!error);
  }

  function setClip(blob, name, file) {
    clip = { blob, name, file };
    $("clip").hidden = false;
    $("clip-name").textContent = name;
    $("clip-dur").textContent = "";
    const a = $("clip-audio");
    if (a.dataset.url) URL.revokeObjectURL(a.dataset.url);
    a.dataset.url = URL.createObjectURL(blob);
    a.src = a.dataset.url;
    drawWave(blob);
    analyse();
  }

  async function drawWave(blob) {
    const wave = $("wave");
    wave.replaceChildren();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      ctx.close && ctx.close();
      $("clip-dur").textContent = `${buf.duration.toFixed(1)} s`;
      const data = buf.getChannelData(0), n = 84, step = Math.max(1, Math.floor(data.length / n)), peaks = [];
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 4) m = Math.max(m, Math.abs(data[j]));
        peaks.push(m);
      }
      const top = Math.max(...peaks) || 1;
      wave.append(...peaks.map(p => { const s = document.createElement("span"); s.style.height = `${Math.max(4, 100 * p / top).toFixed(0)}%`; return s; }));
    } catch { /* the browser cannot decode this format; the server still can */ }
  }

  $("analyze-btn").addEventListener("click", () => analyse());

  function setBusy(on) {
    busy = on;
    $("analyze-btn").disabled = on;
    $("analyze-btn").textContent = on ? "Analysing…" : (document.body.dataset.analysed ? "Analyze again" : "Analyze voice");
    $("file-input").disabled = on;
    document.querySelectorAll("#sample-list button").forEach(b => { b.disabled = on; });
    if (!recording) $("rec-btn").disabled = on;
    $("answer").setAttribute("aria-busy", String(on));
  }

  async function analyse() {
    if (!clip || busy) return;
    setBusy(true);
    setStatus("Analysing the clip…");
    try {
      const fd = new FormData();
      fd.append("audio", clip.blob, clip.file || "recording.webm");
      const res = await fetch("/api/predict", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `The server answered with error ${res.status}.`);
      document.body.dataset.analysed = "1";
      setStatus("");
      showResult(body);
    } catch (e) {
      setStatus(e.message || "The clip could not be analysed. Check that the server is running and try again.", true);
    } finally {
      setBusy(false);
    }
  }

  function showResult(r) {
    const d = r.dialect, top = d.scores[0], unknown = d.status === "unknown_voice";
    // map
    for (const [name, p] of Object.entries(anMap.paths)) {
      const study = MAP.districts.find(x => x.name === name).study;
      p.setAttribute("class", study ? "d-study" : "d-other");
    }
    Object.values(anMap.labels).forEach(l => l.classList.remove("on"));
    const name = mapName(top.id), path = anMap.paths[name], md = MAP.districts.find(x => x.name === name);
    path.setAttribute("class", unknown ? "d-closest" : "d-pred");
    anMap.gP.appendChild(path);
    if (anMap.labels[name]) { anMap.labels[name].classList.add("on"); anMap.labels[name].style.display = unknown ? "" : "none"; }
    Object.entries(anMap.labels).forEach(([n, l]) => { if (n !== name) l.style.display = ""; });
    anMap.pin.setAttribute("cx", md.cx); anMap.pin.setAttribute("cy", md.cy); anMap.pin.style.display = unknown ? "none" : "";
    anMap.svg.setAttribute("aria-label", unknown
      ? `Map of Bangladesh. The voice is unlike the training voices; the closest district, ${top.en}, is outlined.`
      : `Map of Bangladesh. The predicted district, ${top.en}, is filled.`);
    // answer block
    $("ans-k").textContent = unknown ? "Unknown voice. Closest district" : "Most likely district";
    $("ans-v").textContent = top.en;
    $("ans-v").className = `v${unknown ? " closest" : ""}`;
    $("ans-b").textContent = top.bn;
    $("ans-c").innerHTML = `<strong>${F.percent(top.probability)}</strong> ${unknown ? "model score" : "confidence"} <span class="chip ${d.status}">${STATUS[d.status]}</span>`;
    $("ans-hint").hidden = true;
    // ranked districts
    $("rank").replaceChildren(...d.scores.map((s, i) => {
      const li = document.createElement("li");
      if (i === 0) li.className = "is-top";
      li.innerHTML = `<span class="nm">${esc(s.en)} <span class="bn" lang="bn">${esc(s.bn)}</span></span>
        <span class="track"><span class="fill" style="width:${Math.max(0.6, 100 * s.probability).toFixed(1)}%"></span></span>
        <span class="pct">${F.percent(s.probability)}</span>`;
      li.setAttribute("aria-label", `${s.en}: ${F.percent(s.probability)}`);
      return li;
    }));
    // gender and age
    twoWay("g", r.gender, "Male", "Female", "Male", "Female");
    twoWay("a", r.age, "Young", "Adult", "Under 30", "30+");
    // voice check
    const vc = r.voice_check || {}, box = $("voice");
    box.hidden = !vc.available;
    box.classList.toggle("warn", unknown);
    $("voice-ic").textContent = unknown ? "!" : "✓";
    $("voice-txt").innerHTML = unknown
      ? `<b>Unknown voice.</b> ${esc((INFO && INFO.unknown_voice_text) || "This recording is far from the voices the dialect model learned from, so the district answer is not reliable.")} The closest district is outlined for reference only. Gender and age are not affected by this check.`
      : "<b>Known kind of voice.</b> This recording is close to the voices the dialect model learned from, so the district answer can be trusted more than for an unfamiliar voice.";
    // windows
    const wins = r.windows || [];
    $("timeline").hidden = wins.length < 2;
    $("windows").replaceChildren(...wins.map(w => {
      const best = w.dialect.reduce((a, b) => (b.probability > a.probability ? b : a));
      const info = d.scores.find(s => s.id === best.id) || { en: best.id };
      const li = document.createElement("li");
      li.innerHTML = `<span class="t">${w.start.toFixed(1)}–${w.end.toFixed(1)} s</span>
        <span class="track${best.id === top.id ? " is-top" : ""}"><span class="fill" style="width:${(100 * best.probability).toFixed(1)}%;${best.id === top.id ? "background:var(--shapla);opacity:1" : ""}"></span></span>
        <span class="w">${esc(info.en)} ${F.percent0(best.probability)}</span>`;
      return li;
    }));
    const a = r.audio, skipped = (a.windows_total || a.windows) - a.windows;
    $("meta").textContent = `Analysed ${a.seconds} s of audio in ${a.windows} window${a.windows > 1 ? "s" : ""}` +
      (skipped > 0 ? ` (${skipped} mostly silent window${skipped > 1 ? "s" : ""} left out)` : "") +
      (r.seconds_to_predict != null ? ` in ${r.seconds_to_predict} s.` : ".");
    $("result").hidden = false;
    if (innerWidth < 900) $("answer").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function twoWay(prefix, data, idA, idB, labA, labB) {
    const top = data.scores[0], by = Object.fromEntries(data.scores.map(s => [s.id, s]));
    $(`${prefix}-en`).textContent = top.en;
    $(`${prefix}-bn`).textContent = top.bn || "";
    const [sa, sb] = $(`${prefix}-split`).children;
    sa.style.width = `${(100 * by[idA].probability).toFixed(1)}%`;
    sb.style.width = `${(100 * by[idB].probability).toFixed(1)}%`;
    $(`${prefix}-split`).setAttribute("aria-label", `${labA} ${F.percent0(by[idA].probability)}, ${labB} ${F.percent0(by[idB].probability)}`);
    $(`${prefix}-l1`).textContent = `${labA} ${F.percent0(by[idA].probability)}`;
    $(`${prefix}-l2`).textContent = `${labB} ${F.percent0(by[idB].probability)}`;
    const chip = $(`${prefix}-chip`);
    chip.className = `chip ${data.status}`;
    chip.textContent = STATUS[data.status];
  }

  // recording
  let recorder = null, chunks = [], recording = false, timer = null, startedAt = 0;
  const MAX_REC_MS = 30000;
  const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
    .find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";

  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { setStatus("This browser cannot record audio. Upload a recording instead.", true); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false } });
    } catch { setStatus("Microphone access was blocked. Allow the microphone in the browser's address bar, or upload a recording.", true); return; }
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const type = recorder.mimeType || "audio/webm";
      const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
      setClip(new Blob(chunks, { type }), "Your recording", `recording.${ext}`);
    };
    recorder.start();
    recording = true;
    startedAt = Date.now();
    $("rec-btn").setAttribute("aria-pressed", "true");
    setStatus("Recording. Press Stop when you have finished.");
    tick();
    timer = setInterval(tick, 250);
  }
  function tick() {
    const s = (Date.now() - startedAt) / 1000;
    $("rec-label").textContent = `Stop ${s.toFixed(0)} s`;
    if (s * 1000 >= MAX_REC_MS) stopRecording();
  }
  function stopRecording() {
    if (!recording) return;
    recording = false;
    clearInterval(timer);
    $("rec-btn").setAttribute("aria-pressed", "false");
    $("rec-label").textContent = "Record";
    recorder.stop();
  }
  $("rec-btn").addEventListener("click", () => (recording ? stopRecording() : startRecording()));

  // ================================================================ results
  function pageResults() {
    const R = RESEARCH, cols = ["--s1", "--s2", "--s3"];
    // versions
    $("versions").replaceChildren(...R.versions.map(v => {
      const li = document.createElement("li");
      li.className = v.status;
      const tag = { adopted: "In the app", rejected: "Not adopted", replaced: "Replaced", baseline: "Baseline", check: "Check", pending: "Pending" }[v.status];
      li.innerHTML = `<div><h3>${esc(v.name)} <span class="tag ${v.status}">${tag}</span></h3><p class="q">${esc(v.question)}</p>
        <dl>${v.platform ? `<dt>Run on</dt><dd>${esc(v.platform)}${v.notebook ? `<span class="nb">${esc(v.notebook)}</span>` : ""}</dd>` : ""}
        <dt>Data</dt><dd>${esc(v.data)}</dd><dt>Result</dt><dd>${esc(v.result)}</dd><dt>Decision</dt><dd>${esc(v.decision)}</dd></dl></div>`;
      return li;
    }));
    // dialect table
    const T = R.dialect.table;
    const best = row => Math.max(...row.values.filter(v => v != null));
    $("dialect-table").innerHTML = `<table><caption>${esc(T.note)}</caption><thead><tr><th scope="col">Test</th>${T.columns.map(c => `<th scope="col" class="n">${esc(c)}</th>`).join("")}</tr></thead><tbody>
      ${T.rows.map(r => `<tr><th scope="row">${esc(r.test)}</th>${r.values.map(v => `<td class="n${v === best(r) && r.values.filter(x => x === v).length === 1 ? " best" : ""}">${r.format === "percent" ? F.percent(v) : F.decimal(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    // per district, new speakers
    chart("results", () => C.hbars($("ch-district"), {
      label: "Right district for new RegSpeech12 speakers, by district",
      series: [{ name: "GEO v3.1 (RBVD only)" }, { name: "GEO V4.1-A (RBVD + RegSpeech12)" }],
      rows: R.dialect.new_speakers_by_district.map(d => ({ label: d.en, sub: `${d.test_clips} test clips`, values: [d["v3.1"], d["V4.1-A"]], tipExtra: `${d.test_clips} test clips, ${d.train_clips} training clips` })),
      refs: [{ value: 0.125, label: "chance" }],
      extraCols: [{ name: "Test clips", get: r => r.sub.split(" ")[0] }],
    }));
    // known voices
    const K = R.dialect.known_overall;
    $("known-sub").textContent = `The deployed app on the ${K.clips} RBVD test clips: unseen sentences from the voices it learned. ${F.percent(K.accuracy)} right; the voice check flagged ${F.percent(K.flagged_unknown)} of these known voices as unknown.`;
    const en = id => mapName(id);
    chart("results", () => C.heat($("ch-confusion"), {
      label: "Confusion matrix of the app on RBVD test clips", labels: R.dialect.known_confusion.labels.map(en),
      matrix: R.dialect.known_confusion.matrix, short: l => ($("ch-confusion").clientWidth < 560 ? l.slice(0, 4) : l),
    }));
    // leakage
    const Lk = R.dialect.leakage;
    chart("results", () => C.scatter($("ch-leak"), {
      label: "Similarity of each test voice group to its closest training group, against V4.1-A accuracy",
      x: { domain: [0.2, 1.0], label: "Similarity to the closest training group (cosine)" },
      y: { domain: [0, 1], label: "V4.1-A accuracy" },
      bands: [{ from: Lk.same_voice_p05, to: 1.0, label: "Same voice range" }],
      refs: [{ value: Lk.different_people_p99, label: "Different people, 99th pct" }],
      points: Lk.groups.map(g => ({ x: g.similarity, y: g.accuracy, size: g.segments,
        tip: `<b>${esc(mapName(g.district))}, group ${esc(g.group.split("_c").pop())}</b><br>${g.segments} clips, similarity ${g.similarity.toFixed(2)}<br>V4.1-A accuracy ${F.percent0(g.accuracy)}` })),
      tableHead: ["Group", "District", "Clips", "Similarity", "Accuracy"],
      tableRows: Lk.groups.map(g => [g.group, mapName(g.district), String(g.segments), g.similarity.toFixed(3), F.percent(g.accuracy)]),
    }));
    const A = Lk.accuracy, nm = { "all test groups": "All test groups", "without groups flagged at the 99th pct": "Without the most similar groups (99th percentile rule)", "without groups flagged at the 95th pct (stricter)": "Without similar groups (stricter 95th percentile rule)" };
    $("leak-table").innerHTML = `<table><caption>Accuracy on the remaining clips. The same voice scores ${Lk.same_voice_p05.toFixed(2)} or more in 95% of cases; no test group reaches that. Different people from different districts have a median of ${Lk.different_people_median.toFixed(2)}.</caption>
      <thead><tr><th scope="col">Test clips kept</th><th scope="col" class="n">Clips</th><th scope="col" class="n">Groups</th><th scope="col" class="n">v3.1</th><th scope="col" class="n">V4.1-A</th></tr></thead><tbody>
      ${Object.entries(A).map(([k, v]) => `<tr><th scope="row">${esc(nm[k] || k)}</th><td class="n">${v.clips}</td><td class="n">${v.groups}</td><td class="n">${F.percent(v["v3.1"])}</td><td class="n">${F.percent(v["V4.1-A"])}</td></tr>`).join("")}</tbody></table>
      <p class="note">The stricter rule leaves 9 groups, dominated by one Tangail group the model gets entirely wrong (74 clips), which is also the group least similar to any training voice. Per group, the average stays near 75%.</p>`;
    // gender and age
    const D = R.demography, short = { "v3.1": "v3.1", "V4.1-A": "V4.1-A", C0_cv: "C0", C1_cv_l4: "C1", C2_pool: "C2", C3_multi: "C3" };
    const testSeries = D.tests.map(t => ({ name: t.key === "CV test" ? "Common Voice test" : t.key === "Extended test" ? "Extended test" : "New speakers only" }));
    const rows = metric => D.models.map(m => ({ label: m.name, short: short[m.key], sub: m.note, strong: m.key === "v3.1",
      values: D.tests.map(t => D.values[m.key][t.key][metric]) }));
    chart("results", () => C.dots($("ch-gender"), { label: "Gender accuracy by model and test", series: testSeries, rows: rows("gender"), domain: [0.88, 0.98] }));
    chart("results", () => C.dots($("ch-age"), { label: "Age group balanced accuracy by model and test", series: testSeries, rows: rows("age"), domain: [0.5, 0.7], format: F.decimal, tick: F.decimal2 }));
    chart("results", () => C.ci($("ch-ci"), { label: "Differences between models with 95% bootstrap ranges", rows: D.bootstrap }));
    const covSeries = [["v3.1", "GEO v3.1"], ["V4.1-A", "GEO V4.1-A"], ["C0_cv", "C0"]];
    const thrTicks = [0.5, 0.6, 0.7, 0.8, 0.9];
    chart("results", () => C.lines($("ch-cov-a"), {
      label: "Age balanced accuracy of answered clips by confidence needed", height: 240,
      x: { domain: [0.5, 0.95], label: "Confidence needed to answer", ticks: thrTicks, tick: F.percent0 },
      y: { domain: [0.45, 0.7], tick: F.decimal2, format: F.decimal },
      refs: [{ value: 0.5, label: "one group only" }],
      series: covSeries.map(([k, n]) => ({ name: n, points: D.coverage[k].map(p => ({ x: p.threshold, y: p.balanced })) })),
    }));
    chart("results", () => C.lines($("ch-cov-b"), {
      label: "Share of clips that get an age answer by confidence needed", height: 240,
      x: { domain: [0.5, 0.95], label: "Confidence needed to answer", ticks: thrTicks, tick: F.percent0 },
      y: { domain: [0, 1], tick: F.percent0, format: F.percent },
      series: covSeries.map(([k, n]) => ({ name: n, points: D.coverage[k].map(p => ({ x: p.threshold, y: p.answered })) })),
    }));
    const c3 = D.values.C3_multi, conf = D.c3_confirmation, last = R.versions[R.versions.length - 1];
    if (R.c3_available && conf) {
      $("c3-callout").innerHTML = `<h3>C3 confirmation: v3.1 stays</h3><p>${esc(last.result)} ${esc(last.decision)}</p>`;
      if (conf.groups && conf.groups.length) {
        $("c3-fig-groups").hidden = false;
        chart("results", () => C.dots($("ch-c3-groups"), {
          label: "Gender accuracy for women and men, v3.1 and C3", domain: [0.8, 1.0],
          series: [{ name: "GEO v3.1 (in the app)" }, { name: "C3, retrained" }],
          rows: conf.groups.map(g => ({ label: g.label, short: g.label.replace("Common Voice test", "CV test"), sub: `${g.clips} clips`, values: g.values })),
        }));
      }
      $("c3-fig-ci").hidden = false;
      chart("results", () => C.ci($("ch-c3-ci"), { label: "C3 minus v3.1 with 95% bootstrap ranges", rows: conf.bootstrap }));
    } else {
      $("c3-callout").innerHTML = `<h3>C3 is being confirmed</h3><p>C3 had the best gender results in D2 (${F.percent(c3["CV test"].gender)} on the Common Voice test, against ${F.percent(D.values["v3.1"]["CV test"].gender)} for v3.1), but the rule written before D2 kept v3.1 because age did not improve. C3 is being retrained and tested on BanglaAccent voices it has never heard. The app switches only if it holds up; this page will show the result either way.</p>`;
    }
    void cols;
  }

  // ================================================================ data
  function pageData() {
    const R = RESEARCH.data;
    $("datasets").replaceChildren(...R.datasets.map(d => {
      const div = document.createElement("div");
      div.className = "ds";
      div.innerHTML = `<div><h3>${esc(d.name)}</h3><div class="role">${esc(d.role)}</div></div>
        <dl><dt>Size</dt><dd>${esc(d.size)}</dd><dt>Split</dt><dd>${esc(d.split)}</dd><dt>Labels</dt><dd>${esc(d.labels)}</dd>
        <dt>Licence</dt><dd>${esc(d.licence)}</dd><dt>Source</dt><dd>${esc(d.source)}</dd></dl>`;
      return div;
    }));
    const cells = { "Young-M": "Under 30, male", "Young-F": "Under 30, female", "Adult-M": "30+, male", "Adult-F": "30+, female" };
    const tot = k => R.common_voice_cells.reduce((a, c) => a + c[k], 0);
    $("cv-table").innerHTML = `<table><thead><tr><th scope="col">Group</th><th scope="col" class="n">Training</th><th scope="col" class="n">Validation</th><th scope="col" class="n">Test</th></tr></thead><tbody>
      ${R.common_voice_cells.map(c => `<tr><th scope="row">${cells[c.cell]}</th><td class="n">${F.int(c.train)}</td><td class="n">${c.val}</td><td class="n">${c.test}</td></tr>`).join("")}
      <tr><th scope="row">All clips</th><td class="n best">${F.int(tot("train"))}</td><td class="n best">${tot("val")}</td><td class="n best">${tot("test")}</td></tr></tbody></table>`;
    const lang = { bn: "Bangla", hi: "Hindi", ur: "Urdu", mr: "Marathi", ta: "Tamil", ml: "Malayalam", en: "English (first 40 files)" };
    const pool = { validated: "reviewed", other: "not yet reviewed", invalidated: "rejected by reviewers" };
    $("census-table").innerHTML = `<table><thead><tr><th scope="col">Language and pool</th><th scope="col" class="n">Labelled clips</th><th scope="col" class="n">30+ women</th><th scope="col" class="n">30+ men</th><th scope="col" class="n">Under-30 women</th><th scope="col" class="n">Under-30 men</th></tr></thead><tbody>
      ${R.census.map(c => `<tr><th scope="row">${esc(lang[c.language] || c.language)}${c.language === "bn" ? `, ${pool[c.pool]}` : ""}</th><td class="n">${F.int(c.clips)}</td><td class="n best">${F.int(c.adult_f)}</td><td class="n">${F.int(c.adult_m)}</td><td class="n">${F.int(c.young_f)}</td><td class="n">${F.int(c.young_m)}</td></tr>`).join("")}</tbody></table>
      <p class="note">Speakers in each pool; one person can appear in several pools. Assamese, Odia, Punjabi and Nepali had no labelled files in the mirror.</p>`;
    const rs = RESEARCH.data && RESEARCH.dialect && RESEARCH.dialect.new_speakers_by_district;
    $("rs-table").innerHTML = `<table><thead><tr><th scope="col">District</th><th scope="col" class="n">Training</th><th scope="col" class="n">Test</th></tr></thead><tbody>
      ${rs.map(d => `<tr><th scope="row">${esc(d.en)}</th><td class="n">${F.int(d.train_clips)}</td><td class="n">${d.test_clips}</td></tr>`).join("")}</tbody></table>
      <p class="note">Validation takes the remaining segments. Noakhali's few voice groups were large, so the split rule sent most of them to training.</p>`;
    const ba = R.datasets.find(d => d.attribution);
    $("licences").innerHTML = `<ul class="steps">
      <li><b>RBVD</b>: CC BY 4.0. Rahman, M., Rahman, S. A. and Rana, M. S., Regional Bangla Voice Dataset, Mendeley Data, 10.17632/cwz5fgxznr.1. The sample clips on the Analyze page come from its test split.</li>
      <li><b>Mozilla Common Voice 17.0</b>: CC0, read through the fixie-ai/common_voice_17_0 mirror on Hugging Face.</li>
      <li><b>RegSpeech12</b>: Hassan, M. R. et al., RegSpeech12: A Regional Corpus of Bengali Spontaneous Speech Across Dialects, arXiv:2510.24096, 2025; released by its authors for public use.</li>
      <li><b>BanglaAccent</b>: used for testing under its data usage agreement (non-commercial research; the audio is not redistributed).<p class="quote">${esc(ba.attribution)}</p></li>
      <li><b>Map</b>: ${esc(MAP.attribution)}</li>
      <li><b>Fonts</b>: Anek Bangla and Hind Siliguri, SIL Open Font License.</li></ul>`;
  }

  // ================================================================ model
  function pageModel() {
    const M = RESEARCH.model, cal = (INFO && INFO.calibration_detail) || {};
    const mc = cal.min_confidence || { dialect: 0.6, gender: 0.65, age: 0.6 };
    const facts = [
      [`${M.parameters_m} M`, "parameters in each copy"],
      [`${F.percent0(mc.dialect)} / ${F.percent0(mc.gender)} / ${F.percent0(mc.age)}`, "confidence floors for district, gender and age; below them an answer is marked unsure"],
      [M.temperature_dialect.toFixed(2), "temperature that softens the district confidence (set on validation)"],
      [M.unknown_voice.threshold.toFixed(1), "unknown-voice limit: distance from the nearest district's training data"],
      [F.percent0(M.unknown_voice.flagged["validation (known + unseen speakers of the 8 districts)"]), "of validation clips from the eight districts flagged as unknown voices"],
      [F.percent0(M.unknown_voice.flagged["BanglaAccent places outside the 8 districts"]), "of BanglaAccent recordings from other districts flagged"],
    ];
    $("facts").replaceChildren(...facts.map(([b, s]) => { const d = document.createElement("div"); d.innerHTML = `<b>${esc(b)}</b><span>${esc(s)}</span>`; return d; }));
    const AB = M.ablation.rows;
    chart("model", () => C.dots($("ch-ablation"), {
      label: "Dialect macro-F1 by branch, 5-fold mean", domain: [0.9, 1.0], format: F.decimal, tick: F.decimal2,
      series: [{ name: "Macro-F1, 5-fold mean" }],
      rows: AB.map(r => ({ label: r.variant, short: r.variant.split(" (")[0].replace("Temporal only, widened to the fused size", "Temporal, widened"),
        sub: `${(r.params / 1e6).toFixed(2)} M trainable parameters`, strong: r.diff == null, values: [r.mean] })),
    }));
    $("ablation-table").innerHTML = `<table><caption>${esc(M.ablation.source)}. Difference = fused minus this variant, with its 95% range over the 5 folds; p from a paired t-test (5 folds, so low power).</caption>
      <thead><tr><th scope="col">Variant</th><th scope="col" class="n">Trainable parameters</th><th scope="col" class="n">Macro-F1 (mean ± sd)</th><th scope="col" class="n">Fused minus this</th><th scope="col" class="n">p</th></tr></thead><tbody>
      ${AB.map(r => `<tr><th scope="row">${esc(r.variant)}</th><td class="n">${F.int(r.params)}</td><td class="n">${r.mean.toFixed(3)} ± ${r.std.toFixed(3)}</td>
        <td class="n">${r.diff == null ? "–" : `${F.points(r.diff)} (${F.points(r.low)} to ${F.points(r.high)})`}</td><td class="n">${r.p == null ? "–" : r.p < 0.001 ? r.p.toFixed(4) : r.p.toFixed(2)}</td></tr>`).join("")}</tbody></table>`;
    chart("model", () => C.lines($("ch-history"), {
      label: "V4.1-A stage 2 validation macro-F1 by epoch", height: 280,
      x: { domain: [1, M.history_v41.length], label: "Epoch", ticks: M.history_v41.filter(h => h.epoch % 2 === 1).map(h => h.epoch) },
      y: { domain: [0.3, 1.0], tick: F.decimal2, format: F.decimal },
      series: [{ name: "Known voices (RBVD validation)", points: M.history_v41.map(h => ({ x: h.epoch, y: h.known_voices })) },
               { name: "New speakers (RegSpeech12 validation)", points: M.history_v41.map(h => ({ x: h.epoch, y: h.new_speakers })) }],
    }));
  }

  // ================================================================ literature
  function pageLiterature() {
    const L = RESEARCH.literature, themes = Object.fromEntries(L.themes.map(t => [t.id, t]));
    const count = id => L.studies.filter(x => x.theme === id).length;
    $("lit-themes").replaceChildren(...L.themes.map(t => {
      const d = document.createElement("div");
      d.className = "theme";
      d.innerHTML = `<h3><span class="tid">${esc(t.id)}</span>${esc(t.name)}</h3><p>${esc(t.summary)}</p><span class="n">${count(t.id)} ${count(t.id) === 1 ? "study" : "studies"}</span>`;
      return d;
    }));
    let current = "all";
    const filter = $("lit-filter");
    const opts = [["all", "All themes"], ...L.themes.map(t => [t.id, `${t.id}. ${t.name}`])];
    filter.replaceChildren(...opts.map(([id, label]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip-btn"; b.dataset.id = id; b.textContent = label;
      b.setAttribute("aria-pressed", String(id === current));
      b.addEventListener("click", () => { current = id; draw(); });
      return b;
    }));
    const kept = s => /^Yes\b/.test(s) ? "yes" : /^No\b/.test(s) ? "no" : /^Partly\b/.test(s) ? "partly" : "na";
    function draw() {
      filter.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === current)));
      const rows = L.studies.filter(x => x.theme === "ours" || current === "all" || x.theme === current);
      $("lit-count").textContent = `Showing ${rows.length - 1} of ${L.studies.length - 1} studies, plus this project. Dots in the last column: blue, test speakers kept out; pink, not kept out; orange, partly; grey, not stated or not applicable.`;
      $("lit-table").innerHTML = `<table class="lit"><thead><tr><th scope="col">Study</th><th scope="col">Theme</th><th scope="col">Data and method</th><th scope="col">Reported</th><th scope="col">Test speakers kept out of training?</th></tr></thead><tbody>
        ${rows.map(x => `<tr class="${x.theme === "ours" ? "ours" : ""}"><td><b>${esc(x.authors)}, ${x.year}</b><span class="ttl">${esc(x.title)}</span><span class="ven">${esc(x.venue)}</span></td>
          <td>${x.theme === "ours" ? "This project" : `<span class="tid">${esc(x.theme)}</span>`}</td><td>${esc(x.method)}</td><td>${esc(x.findings)}</td>
          <td><span class="kept ${kept(x.speakers)}">${esc(x.speakers)}</span></td></tr>`).join("")}</tbody></table>`;
    }
    draw();
    $("lit-gaps").innerHTML = `<table class="gaps"><thead><tr><th scope="col">Gap</th><th scope="col">What the literature shows</th><th scope="col">How this project addresses it</th></tr></thead><tbody>
      ${L.gaps.map((g, k) => `<tr><td><b>${k + 1}. ${esc(g.gap)}</b></td><td>${esc(g.literature)}</td><td>${esc(g.here)}</td></tr>`).join("")}</tbody></table>`;
    const C2 = L.comparison, last = C2.columns.length - 1;
    $("lit-compare").innerHTML = `<table class="compare"><thead><tr><th scope="col">Feature</th>${C2.columns.map((c, k) => `<th scope="col" class="${k === last ? "us" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>
      ${C2.rows.map(r => `<tr><th scope="row">${esc(r.feature)}</th>${r.values.map((v, k) => `<td class="${k === last ? "us" : ""} ${/^Yes\b/.test(v) ? "y" : /^No\b/.test(v) ? "x" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}
      <tr><th scope="row">Reported result</th>${C2.reported.map((v, k) => `<td class="${k === last ? "us" : ""}">${esc(v)}</td>`).join("")}</tr></tbody></table>`;
  }

  const PAGES = { home: pageHome, analyze: pageAnalyze, results: pageResults, data: pageData, model: pageModel, literature: pageLiterature, about: () => {} };
  route();
})();
