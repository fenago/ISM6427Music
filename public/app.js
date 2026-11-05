// SongForge front end. Talks only to our own /api/* Netlify Functions,
// which hold the SunoAPI key server-side.

const $ = (sel, root = document) => root.querySelector(sel);
const STORE_KEY = "songforge.jobs.v1";
const PASS_KEY = "songforge.passcode";
const POLL_MS = 5000;
const MAX_POLL_MS = 15 * 60 * 1000;

const IDEAS = [
  "A lo-fi study beat for a rainy Sunday afternoon",
  "An epic cinematic anthem about chasing your dreams",
  "A funny country song about a dog who steals tacos",
  "A smooth jazz tune for a late-night city drive",
  "An energetic K-pop track about the first day of summer",
  "A heartfelt acoustic ballad for a best friend's wedding",
];
const STYLES = ["pop", "hip hop", "lo-fi", "rock", "EDM", "R&B", "country", "jazz", "reggaeton", "cinematic", "acoustic", "synthwave"];

const state = { mode: "simple", jobs: loadJobs(), pollers: new Map() };

/* ---------- storage ---------- */
function loadJobs() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function saveJobs() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.jobs.slice(0, 50))); } catch { /* ignore */ }
}
function getPasscode() {
  try { return localStorage.getItem(PASS_KEY) || ""; } catch { return ""; }
}
function setPasscode(v) {
  try { v ? localStorage.setItem(PASS_KEY, v) : localStorage.removeItem(PASS_KEY); } catch { /* ignore */ }
}

/* ---------- api ---------- */
async function api(path, { method = "GET", body } = {}) {
  const headers = { "content-type": "application/json" };
  const pass = getPasscode();
  if (pass) headers["x-app-passcode"] = pass;
  let res, data;
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    data = await res.json();
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }
  if (res.status === 401 && /passcode/i.test(data?.error || "")) {
    $("#passcodeBtn").classList.remove("hidden");
    const entered = prompt("This studio is protected. Enter the passcode:");
    if (entered) { setPasscode(entered.trim()); return api(path, { method, body }); }
  }
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- composer ---------- */
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.mode === mode;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  $(".mode-simple").classList.toggle("hidden", mode !== "simple");
  $(".mode-custom").classList.toggle("hidden", mode !== "custom");
  document.querySelectorAll(".simple-only").forEach((el) => el.classList.toggle("hidden", mode !== "simple"));
  syncInstrumental();
}

function syncInstrumental() {
  const inst = $("#instrumental").checked;
  $("#lyrics").disabled = inst;
  $("#lyrics").placeholder = inst ? "Instrumental — no lyrics needed" : "[Verse]\nNeon lights on the boulevard\n...\n\n[Chorus]\n...";
  $("#vocalGender").disabled = inst;
}

function readForm() {
  return {
    customMode: state.mode === "custom",
    instrumental: $("#instrumental").checked,
    model: $("#model").value,
    prompt: $("#prompt").value.trim(),
    style: $("#style").value.trim(),
    title: $("#title").value.trim(),
    lyrics: $("#lyrics").value.trim(),
    negativeTags: $("#negativeTags").value.trim(),
    vocalGender: $("#vocalGender").value,
    duration: $("#duration").value,
    styleWeight: $("#styleWeight").value,
    weirdnessConstraint: $("#weirdness").value,
  };
}

function validate(p) {
  if (!p.customMode) {
    if (!p.prompt && !p.style) return "Tell us what your song is about.";
  } else {
    if (!p.style && !p.lyrics) return "Add a style or some lyrics.";
    if (!p.instrumental && !p.lyrics) return "Add lyrics — or switch on Instrumental. Tip: try “Write lyrics with AI”.";
  }
  return null;
}

function showFormError(msg) {
  const el = $("#formError");
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.innerHTML = busy ? `<span class="spinner"></span><span>${label}</span>` : `<span class="btn-label">${label}</span>`;
}

async function onSubmit(e) {
  e.preventDefault();
  const params = readForm();
  const err = validate(params);
  showFormError(err);
  if (err) return;

  const btn = $("#generateBtn");
  setBusy(btn, true, "Starting…");
  try {
    const { taskId } = await api("/api/generate", { method: "POST", body: params });
    const job = {
      taskId,
      params,
      label: params.customMode ? params.title || params.style || "Custom song" : params.prompt || params.style,
      createdAt: Date.now(),
      status: "PENDING",
      tracks: [],
      error: null,
    };
    state.jobs.unshift(job);
    saveJobs();
    render();
    poll(job);
    document.getElementById("libTitle").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (ex) {
    showFormError(ex.message);
  } finally {
    setBusy(btn, false, "Generate song");
  }
}

/* ---------- AI lyrics ---------- */
async function writeLyrics() {
  const idea = $("#lyricsIdea").value.trim() || $("#title").value.trim() || $("#style").value.trim();
  if (!idea) { $("#lyricsIdea").focus(); return; }
  const btn = $("#lyricsGo");
  const box = $("#lyricsOptions");
  setBusy(btn, true, "Writing…");
  box.innerHTML = "";
  try {
    const { taskId } = await api("/api/lyrics", { method: "POST", body: { prompt: idea.slice(0, 200) } });
    const started = Date.now();
    while (Date.now() - started < 3 * 60 * 1000) {
      await sleep(3000);
      const r = await api(`/api/lyrics?taskId=${encodeURIComponent(taskId)}`);
      if (r.failed) throw new Error(r.error || "Lyrics generation failed.");
      if (r.done && r.options.length) {
        r.options.forEach((opt) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "lyrics-option";
          b.innerHTML = `<strong></strong><small></small>`;
          b.querySelector("strong").textContent = `Use: ${opt.title || "Untitled"}`;
          b.querySelector("small").textContent = opt.text;
          b.onclick = () => {
            $("#lyrics").value = opt.text;
            if (!$("#title").value && opt.title) $("#title").value = opt.title;
            box.innerHTML = "";
            $("#lyricsHelper").classList.add("hidden");
            updateCounts();
          };
          box.appendChild(b);
        });
        return;
      }
    }
    throw new Error("Lyrics are taking too long. Try again.");
  } catch (ex) {
    box.innerHTML = `<p class="error"></p>`;
    box.querySelector("p").textContent = ex.message;
  } finally {
    setBusy(btn, false, "Write");
  }
}

/* ---------- polling ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(job) {
  if (state.pollers.has(job.taskId)) return;
  state.pollers.set(job.taskId, true);
  let errors = 0;
  try {
    while (!isFinal(job) && Date.now() - job.createdAt < MAX_POLL_MS) {
      await sleep(POLL_MS);
      try {
        const r = await api(`/api/status?taskId=${encodeURIComponent(job.taskId)}`);
        errors = 0;
        job.status = r.status;
        if (r.tracks.length) job.tracks = r.tracks;
        if (r.failed) job.error = r.error || "Generation failed.";
      } catch (ex) {
        if (++errors >= 5) { job.status = "ERROR"; job.error = ex.message; }
      }
      saveJobs();
      renderJob(job);
    }
    if (!isFinal(job)) { job.status = "ERROR"; job.error = "Timed out waiting for the song."; saveJobs(); renderJob(job); }
    if (job.status === "SUCCESS") refreshCredits();
  } finally {
    state.pollers.delete(job.taskId);
  }
}
const isFinal = (j) => j.status === "SUCCESS" || Boolean(j.error);

/* ---------- rendering ---------- */
const STATUS_TEXT = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing music…",
  FIRST_SUCCESS: "Almost done…",
  SUCCESS: "Ready",
};

function fmtTime(sec) {
  if (!sec) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function render() {
  const wrap = $("#jobs");
  wrap.innerHTML = "";
  $("#empty").classList.toggle("hidden", state.jobs.length > 0);
  $("#clearBtn").classList.toggle("hidden", state.jobs.length === 0);
  state.jobs.forEach((job) => wrap.appendChild(buildJob(job)));
}

function buildJob(job) {
  const el = $("#jobTpl").content.firstElementChild.cloneNode(true);
  el.dataset.task = job.taskId;
  fillJob(el, job);
  return el;
}

function renderJob(job) {
  const el = document.querySelector(`.job[data-task="${CSS.escape(job.taskId)}"]`);
  if (el) fillJob(el, job);
}

function fillJob(el, job) {
  const p = job.params || {};
  el.querySelector(".job-title").textContent = job.label || "Untitled";
  el.querySelector(".job-meta").textContent = [
    new Date(job.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
    p.model,
    p.customMode ? "Custom" : "Simple",
    p.instrumental ? "Instrumental" : null,
  ].filter(Boolean).join(" · ");

  const status = el.querySelector(".status");
  const failed = Boolean(job.error);
  status.textContent = failed ? "Failed" : STATUS_TEXT[job.status] || job.status;
  status.className = "status" + (job.status === "SUCCESS" ? " ok" : failed ? " bad" : "");
  el.classList.toggle("complete", job.status === "SUCCESS");
  el.classList.toggle("failed", failed);
  el.classList.toggle("streaming", job.tracks.length > 0);

  const errEl = el.querySelector(".job-error");
  errEl.textContent = job.error || "";
  errEl.classList.toggle("hidden", !failed);

  const tracksEl = el.querySelector(".tracks");
  job.tracks.forEach((t, i) => {
    let card = tracksEl.querySelector(`[data-id="${CSS.escape(t.id || String(i))}"]`);
    if (!card) {
      card = $("#trackTpl").content.firstElementChild.cloneNode(true);
      card.dataset.id = t.id || String(i);
      card.querySelector(".show-lyrics").onclick = () => card.querySelector(".track-lyrics").classList.toggle("hidden");
      card.querySelector(".reuse").onclick = () => reuse(job.params);
      tracksEl.appendChild(card);
    }
    fillTrack(card, t);
  });
}

function fillTrack(card, t) {
  card.querySelector(".track-title").textContent = t.title || "Untitled";
  card.querySelector(".track-dur").textContent = fmtTime(t.duration);
  card.querySelector(".track-tags").textContent = t.tags || "";
  const img = card.querySelector("img");
  if (t.image && img.getAttribute("src") !== t.image) img.src = t.image;
  if (!t.image) img.setAttribute("src", "");

  const audio = card.querySelector("audio");
  const src = t.audio || t.stream;
  // Swap from stream to final MP3 only when not playing, so playback isn't interrupted.
  if (src && audio.dataset.src !== src && (audio.paused || !audio.dataset.src)) {
    audio.src = src;
    audio.dataset.src = src;
  }

  const dl = card.querySelector(".dl");
  if (t.audio) {
    dl.href = t.audio;
    dl.setAttribute("download", `${(t.title || "song").replace(/[^\w\- ]+/g, "")}.mp3`);
    dl.classList.remove("disabled");
    dl.textContent = "⬇ Download MP3";
  } else {
    dl.removeAttribute("href");
    dl.classList.add("disabled");
    dl.textContent = "Finishing MP3…";
  }

  const lyr = card.querySelector(".track-lyrics");
  lyr.textContent = t.lyrics || "(instrumental)";
  card.querySelector(".show-lyrics").classList.toggle("hidden", !t.lyrics);
}

function reuse(p = {}) {
  setMode(p.customMode ? "custom" : "simple");
  $("#prompt").value = p.prompt || "";
  $("#style").value = p.style || "";
  $("#title").value = p.title || "";
  $("#lyrics").value = p.lyrics || "";
  $("#negativeTags").value = p.negativeTags || "";
  $("#vocalGender").value = p.vocalGender || "";
  $("#duration").value = p.duration || "";
  $("#instrumental").checked = Boolean(p.instrumental);
  if (p.model) $("#model").value = p.model;
  if (p.styleWeight) $("#styleWeight").value = p.styleWeight;
  if (p.weirdnessConstraint) $("#weirdness").value = p.weirdnessConstraint;
  syncInstrumental();
  updateCounts();
  updateSliders();
  $("#composeTitle").scrollIntoView({ behavior: "smooth" });
}

/* ---------- misc UI ---------- */
function updateCounts() {
  document.querySelectorAll(".count").forEach((c) => {
    const f = document.getElementById(c.dataset.for);
    c.textContent = f.value.length ? `${f.value.length}/${f.maxLength}` : "";
  });
}
function updateSliders() {
  $("#styleWeightOut").textContent = Number($("#styleWeight").value).toFixed(2);
  $("#weirdnessOut").textContent = Number($("#weirdness").value).toFixed(2);
}

async function refreshCredits() {
  try {
    const { credits } = await api("/api/credits");
    $("#credits").textContent = `Credits: ${Number(credits).toLocaleString()}`;
  } catch {
    $("#credits").textContent = "Credits: —";
  }
}

function addChips(container, items, onPick) {
  items.forEach((text) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = text;
    b.onclick = () => onPick(text);
    container.appendChild(b);
  });
}

function init() {
  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => setMode(t.dataset.mode)));
  $("#form").addEventListener("submit", onSubmit);
  $("#instrumental").addEventListener("change", syncInstrumental);
  ["prompt", "lyrics"].forEach((id) => document.getElementById(id).addEventListener("input", updateCounts));
  ["styleWeight", "weirdness"].forEach((id) => document.getElementById(id).addEventListener("input", updateSliders));

  $("#lyricsBtn").onclick = () => {
    $("#lyricsHelper").classList.toggle("hidden");
    $("#lyricsIdea").focus();
  };
  $("#lyricsGo").onclick = writeLyrics;
  $("#lyricsIdea").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); writeLyrics(); } });

  $("#clearBtn").onclick = () => {
    if (!confirm("Remove all songs from this browser's history?")) return;
    state.jobs = [];
    saveJobs();
    render();
  };
  $("#passcodeBtn").onclick = () => {
    const v = prompt("Enter the studio passcode:", getPasscode());
    if (v !== null) { setPasscode(v.trim()); refreshCredits(); }
  };

  addChips($("#ideaChips"), IDEAS, (t) => { $("#prompt").value = t; updateCounts(); });
  addChips($("#styleChips"), STYLES, (t) => {
    const cur = $("#style").value.trim();
    const parts = cur ? cur.split(/\s*,\s*/) : [];
    if (!parts.includes(t)) parts.push(t);
    $("#style").value = parts.join(", ");
  });

  setMode("simple");
  updateSliders();
  render();
  state.jobs.filter((j) => !isFinal(j)).forEach(poll);
  refreshCredits();
}

init();
