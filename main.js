/* ══════════════════════════════════════════════════
   main.js
   1. Coverage field   — canvas dot-matrix, signal ping
   2. Scroll progress  — top bar
   3. Reveals          — IntersectionObserver
   4. Counters         — animated figures
   5. Programme stack  — accessible accordion
   ══════════════════════════════════════════════════ */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────────────────────────────────────────
   1. COVERAGE FIELD
   A grid of dots. A ring of signal travels out
   from a slowly drifting source; the pointer
   emits its own ripple.
   ───────────────────────────────────────────── */
(function field(){
  const cv = document.getElementById('field');
  if (!cv) return;
  const ctx = cv.getContext('2d', { alpha: true });

  const GAP    = 27;    // px between dots
  const SIZE   = 2.4;   // dot size
  const BASE   = 'rgba(237,230,218,1)';
  const SIGNAL = 'rgba(255,146,69,1)';

  let dots = [], w = 0, h = 0, dpr = 1;
  const ptr = { x: -9999, y: -9999, on: false };

  function build(){
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    dots = [];
    const cols = Math.ceil(w / GAP) + 1;
    const rows = Math.ceil(h / GAP) + 1;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        dots.push({ x: i * GAP, y: j * GAP });
  }

  function frame(now){
    const t = now * 0.001;
    ctx.clearRect(0, 0, w, h);

    // drifting signal source
    const sx = w * (0.5 + 0.34 * Math.cos(t * 0.16));
    const sy = h * (0.45 + 0.26 * Math.sin(t * 0.21));

    // pass 1 — resting grid
    ctx.fillStyle = BASE;
    ctx.globalAlpha = 0.075;
    for (const d of dots) ctx.fillRect(d.x, d.y, SIZE, SIZE);

    // pass 2 — signal
    ctx.fillStyle = SIGNAL;
    for (const d of dots){
      const dx = d.x - sx, dy = d.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // sharp travelling ring
      let v = Math.sin(dist * 0.0165 - t * 1.5);
      v = v > 0 ? Math.pow(v, 7) : 0;

      // pointer ripple
      if (ptr.on){
        const px = d.x - ptr.x, py = d.y - ptr.y;
        const pd = Math.sqrt(px * px + py * py);
        if (pd < 190) v = Math.max(v, Math.pow(1 - pd / 190, 2.2));
      }

      if (v > 0.015){
        ctx.globalAlpha = Math.min(v * 0.95, 1);
        const s = SIZE + v * 2.4;
        ctx.fillRect(d.x - (s - SIZE) / 2, d.y - (s - SIZE) / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  function still(){                       // single static frame
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BASE; ctx.globalAlpha = 0.075;
    for (const d of dots) ctx.fillRect(d.x, d.y, SIZE, SIZE);
    ctx.globalAlpha = 1;
  }

  build();
  addEventListener('resize', () => { build(); if (REDUCED) still(); }, { passive: true });

  if (REDUCED){ still(); return; }

  addEventListener('pointermove', e => {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true;
  }, { passive: true });
  addEventListener('pointerleave', () => { ptr.on = false; }, { passive: true });

  requestAnimationFrame(frame);
})();


/* ─────────────────────────────────────────────
   2. SCROLL PROGRESS
   ───────────────────────────────────────────── */
(function progress(){
  const bar = document.getElementById('progress');
  if (!bar) return;
  let queued = false;
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      const max = document.body.scrollHeight - innerHeight;
      bar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + '%';
      queued = false;
    });
  }, { passive: true });
})();


/* ─────────────────────────────────────────────
   3. REVEALS  +  4. COUNTERS
   ───────────────────────────────────────────── */
(function reveals(){
  const items = document.querySelectorAll('.reveal');

  function runCount(el){
    const to     = parseFloat(el.dataset.to);
    const suffix = el.dataset.suffix || '';
    if (REDUCED){ el.textContent = to + suffix; return; }

    const dur = 1400, t0 = performance.now();
    (function step(now){
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * eased) + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  if (!('IntersectionObserver' in window)){
    items.forEach(el => {
      el.classList.add('seen');
      el.querySelectorAll('.count').forEach(runCount);
    });
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('seen');
      en.target.querySelectorAll('.count').forEach(runCount);
      obs.unobserve(en.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -60px' });

  items.forEach(el => io.observe(el));
})();


/* ─────────────────────────────────────────────
   5. PROGRAMME ACCORDION
   One panel open at a time. aria-expanded kept
   in sync so screen readers follow along.
   ───────────────────────────────────────────── */
(function accordion(){
  const cards = [...document.querySelectorAll('.prog')];

  cards.forEach(card => {
    const bar = card.querySelector('.prog-bar');
    bar.addEventListener('click', () => {
      const open = card.hasAttribute('data-open');
      cards.forEach(c => {
        c.removeAttribute('data-open');
        c.querySelector('.prog-bar').setAttribute('aria-expanded', 'false');
      });
      if (!open){
        card.setAttribute('data-open', '');
        bar.setAttribute('aria-expanded', 'true');
      }
    });
  });
})();
