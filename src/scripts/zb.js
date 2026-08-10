// Zero Bullshit mode: dark theme, blunter copy, generative music loop —
// switched with a radial wipe from the toggle and a text-scramble on the copy.
// Copy variants live in data-zb-alt attributes; originals are stashed on first
// toggle so the swap is reversible.

const root = document.documentElement;
const toggle = document.getElementById('zbToggle');
const hint = document.getElementById('zbHint');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── text scramble ─────────────────────────────── */
const GLYPHS = '▪▫▚▞#%&$@!?/\\<>-_=+*';

function scrambleTo(el, text, dur = 420) {
  if (reduced) { el.textContent = text; return; }
  const from = el.textContent;
  const len = Math.max(from.length, text.length);
  const t0 = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - t0) / dur);
    let out = '';
    for (let i = 0; i < len; i++) {
      const reveal = i / len < p * 1.4 - 0.2;
      if (reveal || p === 1) out += text[i] || '';
      else if (Math.random() < 0.28) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      else out += (from[i] || text[i] || '');
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = text;
  })(t0);
}

function swapCopy(on, animate = true) {
  document.querySelectorAll('[data-zb-alt]').forEach((el, i) => {
    if (el.dataset.zbOrig === undefined) el.dataset.zbOrig = el.textContent;
    const next = on ? el.dataset.zbAlt : el.dataset.zbOrig;
    if (animate) setTimeout(() => scrambleTo(el, next), i * 40);
    else el.textContent = next;
  });
  // toggle word flips to name the mode you'd switch to
  const word = toggle.querySelector('.zb-word');
  if (word) {
    if (word.dataset.orig === undefined) word.dataset.orig = word.textContent;
    const alt = toggle.dataset.labelAlt || word.dataset.orig;
    word.textContent = on ? alt : word.dataset.orig;
  }
}

/* ── radial wipe from the toggle button ────────── */
function wipe(on) {
  if (reduced) return;
  const r = toggle.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const el = document.createElement('div');
  el.className = 'zb-wipe';
  el.style.background = on ? '#0c0c10' : '#f4f1ea';
  el.style.clipPath = `circle(0px at ${x}px ${y}px)`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.clipPath = `circle(160vmax at ${x}px ${y}px)`;
  });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 500);
  }, 620);
}

/* ── generative music ──────────────────────────────
   A small original synth groove: kick / hat / bass line / stab chords,
   sequenced with the Web Audio clock. No audio files, no libraries. */
let audio = null;

function makeAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);

  const bpm = 96;
  const spb = 60 / bpm;
  const step = spb / 4;
  let cursor = 0;
  let timer = null;

  const bassNotes = [41.2, 41.2, 49.0, 41.2, 41.2, 55.0, 49.0, 46.2];
  const stabChord = [164.8, 196.0, 246.9];

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.25);
  }
  function hat(t, openHat) {
    const len = openHat ? 0.18 : 0.05;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = openHat ? 0.25 : 0.18;
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }
  function bass(t, freq) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(120, t + step * 1.8);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + step * 1.9);
    o.connect(f).connect(g).connect(out);
    o.start(t); o.stop(t + step * 2);
  }
  function stab(t) {
    for (const freq of stabChord) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 0.32);
    }
  }

  let startAt = 0;
  function schedule() {
    while (cursor * step < ctx.currentTime + 0.2 - startAt + 0.0001) {
      const t = startAt + cursor * step;
      const s16 = cursor % 16;
      if (s16 % 4 === 0) kick(t);
      if (s16 % 2 === 0) hat(t, s16 === 14);
      if (s16 % 2 === 0) bass(t, bassNotes[(cursor / 2) % 8 | 0]);
      if (s16 === 4 || s16 === 12) stab(t);
      cursor++;
    }
  }

  return {
    ctx,
    start() {
      ctx.resume();
      startAt = ctx.currentTime + 0.05;
      cursor = 0;
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setValueAtTime(0.0001, ctx.currentTime);
      out.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.2);
      schedule();
      timer = setInterval(schedule, 90);
    },
    stop() {
      clearInterval(timer);
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setValueAtTime(out.gain.value || 0.0001, ctx.currentTime);
      out.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    }
  };
}

function showHint(text) {
  hint.textContent = text;
  hint.classList.add('show');
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => hint.classList.remove('show'), 2600);
}

function apply(on, { silent = false } = {}) {
  const flip = () => {
    if (on) root.dataset.zb = ''; else delete root.dataset.zb;
    toggle.setAttribute('aria-pressed', String(on));
    swapCopy(on, !silent);
    dispatchEvent(new CustomEvent('zbchange', { detail: { on } }));
  };
  localStorage.setItem('zb', on ? '1' : '0');
  if (silent || reduced) { flip(); return; }

  wipe(on);
  // theme flips mid-wipe so the sweep reveals the new mode
  setTimeout(flip, 240);
  showHint(on ? toggle.dataset.hintOn : toggle.dataset.hintOff);
  if (on) {
    if (!audio) audio = makeAudio();
    audio.start();
  } else if (audio) {
    audio.stop();
  }
}

toggle.addEventListener('click', () => apply(!('zb' in root.dataset)));

// Restore saved state (theme applied pre-paint in <head>; music stays off
// until a click, since browsers block autoplaying audio anyway).
if ('zb' in root.dataset) apply(true, { silent: true });

// Pause the groove when the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (!audio) return;
  if (document.hidden) audio.ctx.suspend();
  else if ('zb' in root.dataset) audio.ctx.resume();
});
