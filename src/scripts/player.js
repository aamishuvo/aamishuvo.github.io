// Music playlist player for Chill mode.
//
// Plays audio files listed in settings.playlist, exposes live beat phase and
// low-band energy so the avatar can dance in time, and renders a small transport
// (previous / play / next) for visitors. When the playlist is empty the site
// falls back to the generative synth in zb.js.

const state = {
  tracks: [],
  mode: 'sequential',
  index: 0,
  audio: null,
  ctx: null,
  analyser: null,
  gain: null,
  freq: null,
  playing: false,
  energy: 0,      // smoothed low-band energy, 0..1
  pulse: 0,       // decays after each transient, 0..1
  lastLow: 0,
  beat: 0,        // beats elapsed in the current track
  beatPhase: 0,   // 0..1 within the current beat
  bar: 0
};

export const player = state;

export function hasPlaylist() {
  return state.tracks.length > 0;
}

export function currentTrack() {
  return state.tracks[state.index] || null;
}

/** "2:07" / "127" / "1:02.5" → seconds. Blank or malformed returns 0. */
export function parseTime(v) {
  if (v === undefined || v === null) return 0;
  const str = String(v).trim();
  if (!str) return 0;
  const parts = str.split(':').map((x) => parseFloat(x));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let secs = 0;
  for (const n of parts) secs = secs * 60 + n;
  return Math.max(0, secs);
}

function startOf(t) { return t ? parseTime(t.start) : 0; }
function endOf(t) { return t ? parseTime(t.end) : 0; }

/** Action the avatar should perform for the current track. */
export function currentAction() {
  const t = currentTrack();
  return (t && t.action) || 'dance';
}

export function initPlayer(tracks, mode) {
  state.tracks = (tracks || []).filter((t) => t && t.src);
  state.mode = mode === 'random' ? 'random' : 'sequential';
  if (!state.tracks.length) return false;
  if (state.mode === 'random') state.index = Math.floor(Math.random() * state.tracks.length);
  buildUI();
  return true;
}

function ensureAudio() {
  if (state.audio) return;
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'none';
  audio.addEventListener('loadedmetadata', () => {
    // skip any silence at the head of the file
    const from = startOf(currentTrack());
    if (from > 0 && from < (audio.duration || Infinity)) audio.currentTime = from;
  });
  audio.addEventListener('ended', () => next());
  audio.addEventListener('error', () => {
    // a missing or unplayable file should not stall the playlist
    if (state.tracks.length > 1) next();
  });
  state.audio = audio;
}

function ensureGraph() {
  if (state.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const src = ctx.createMediaElementSource(state.audio);
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.7;
  src.connect(gain).connect(analyser);
  analyser.connect(ctx.destination);
  state.ctx = ctx;
  state.gain = gain;
  state.analyser = analyser;
  state.freq = new Uint8Array(analyser.frequencyBinCount);
}

function load(i, autoplay) {
  const t = state.tracks[i];
  if (!t) return;
  state.index = i;
  ensureAudio();
  state.audio.src = t.src;
  state.beat = 0; state.bar = 0; state.beatPhase = 0;
  paintUI();
  dispatchEvent(new CustomEvent('trackchange', { detail: { track: t, action: currentAction() } }));
  if (autoplay) state.audio.play().catch(() => { /* blocked until a gesture */ });
}

export function start() {
  if (!state.tracks.length) return;
  ensureAudio();
  if (!state.audio.src) load(state.index, false);
  ensureGraph();
  if (state.ctx && state.ctx.state === 'suspended') state.ctx.resume();
  state.playing = true;
  if (state.gain) {
    const now = state.ctx.currentTime;
    state.gain.gain.cancelScheduledValues(now);
    state.gain.gain.setValueAtTime(Math.max(state.gain.gain.value, 0.0001), now);
    state.gain.gain.exponentialRampToValueAtTime(0.85, now + 1.2);
  }
  state.audio.play().catch(() => { /* autoplay policy */ });
  paintUI();
}

export function stop() {
  state.playing = false;
  if (state.gain && state.ctx) {
    const now = state.ctx.currentTime;
    state.gain.gain.cancelScheduledValues(now);
    state.gain.gain.setValueAtTime(Math.max(state.gain.gain.value, 0.0001), now);
    state.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  }
  setTimeout(() => { if (!state.playing && state.audio) state.audio.pause(); }, 620);
  paintUI();
}

export function next() {
  if (!state.tracks.length) return;
  const i = state.mode === 'random'
    ? pickRandomOther()
    : (state.index + 1) % state.tracks.length;
  load(i, state.playing);
}

export function prev() {
  if (!state.tracks.length) return;
  // restart the track first, like every music player
  if (state.audio && state.audio.currentTime > 3) { state.audio.currentTime = 0; return; }
  const i = state.mode === 'random'
    ? pickRandomOther()
    : (state.index - 1 + state.tracks.length) % state.tracks.length;
  load(i, state.playing);
}

function pickRandomOther() {
  if (state.tracks.length < 2) return state.index;
  let i = state.index;
  while (i === state.index) i = Math.floor(Math.random() * state.tracks.length);
  return i;
}

/** Call once per frame; keeps energy, pulse and beat phase current. */
export function sample(dt) {
  if (!state.playing || !state.analyser) {
    state.energy += (0 - state.energy) * Math.min(1, dt * 3);
    state.pulse *= 0.9;
    return;
  }
  state.analyser.getByteFrequencyData(state.freq);
  // low band ≈ kick and bass, which is what a dancer moves to
  let low = 0;
  const n = Math.max(4, Math.floor(state.freq.length * 0.08));
  for (let i = 0; i < n; i++) low += state.freq[i];
  low = low / n / 255;

  state.energy += (low - state.energy) * Math.min(1, dt * 6);
  const rise = low - state.lastLow;
  if (rise > 0.06) state.pulse = Math.min(1, state.pulse + rise * 3);
  state.pulse *= Math.pow(0.02, dt); // fast decay
  state.lastLow = low;

  const t = currentTrack();
  const from = startOf(t), to = endOf(t);
  if (to > from && state.audio.currentTime >= to) { next(); return; }
  // if the seek to the start offset was missed (preload can delay metadata),
  // catch it here so playback never sits in the silent lead-in
  if (from > 0 && state.audio.currentTime < from - 0.05 && state.audio.readyState > 0) {
    state.audio.currentTime = from;
  }
  const bpm = (t && Number(t.bpm)) > 0 ? Number(t.bpm) : 100;
  const beats = Math.max(0, ((state.audio.currentTime - from) * bpm) / 60);
  state.beat = Number.isFinite(beats) ? beats : 0;
  state.beatPhase = state.beat % 1;
  state.bar = Math.floor(state.beat / 4);
}

/* ── transport UI ───────────────────────────────── */
let ui = null;

function buildUI() {
  if (ui) return;
  const bn = document.documentElement.lang === 'bn';
  ui = document.createElement('div');
  ui.className = 'player';
  ui.hidden = true;
  ui.innerHTML = `
    <button class="player-btn" data-act="prev" aria-label="${bn ? 'আগের গান' : 'Previous track'}">⏮</button>
    <button class="player-btn play" data-act="toggle" aria-label="${bn ? 'বাজান / থামান' : 'Play or pause'}">⏸</button>
    <button class="player-btn" data-act="next" aria-label="${bn ? 'পরের গান' : 'Next track'}">⏭</button>
    <span class="player-meta"><b></b><em></em></span>
  `;
  ui.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'next') next();
    else if (b.dataset.act === 'prev') prev();
    else state.playing ? stop() : start();
  });
  document.body.appendChild(ui);
  paintUI();
}

export function showUI(on) {
  if (ui) ui.hidden = !on;
}

function paintUI() {
  if (!ui) return;
  const t = currentTrack();
  ui.querySelector('.player-meta b').textContent = t ? (t.title || '') : '';
  ui.querySelector('.player-meta em').textContent = t ? (t.artist || '') : '';
  ui.querySelector('.play').textContent = state.playing ? '⏸' : '▶';
  ui.classList.toggle('is-playing', state.playing);
}
