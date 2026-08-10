// Ambient background: a breathing dot-field behind the hero.
// Dots ride a slow interference wave and swell near the pointer.
// Calm in corporate mode; faster and brighter in Zero Bullshit mode.

const canvas = document.getElementById('field');
if (canvas) initField(canvas);

function initField(canvas) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  const DPR = Math.min(devicePixelRatio, 1.5);
  const STEP = 34;

  let w = 0, h = 0;
  let px = -9999, py = -9999;
  let visible = true;
  let zb = 'zb' in document.documentElement.dataset;
  let accent = '#e6432d', ink = '#16130d';

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    accent = cs.getPropertyValue('--accent').trim() || accent;
    ink = cs.getPropertyValue('--ink').trim() || ink;
    zb = 'zb' in document.documentElement.dataset;
  }
  readTheme();
  addEventListener('zbchange', () => setTimeout(readTheme, 500));

  function resize() {
    w = hero.clientWidth;
    h = hero.clientHeight;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  new ResizeObserver(resize).observe(hero);
  resize();

  addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    px = e.clientX - r.left;
    py = e.clientY - r.top;
  }, { passive: true });

  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(canvas);

  let t = 0, last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt * (zb ? 2.2 : 0.7);

    ctx.clearRect(0, 0, w, h);
    const amp = zb ? 2.6 : 1.4;
    const base = zb ? 1.1 : 0.9;

    for (let y = STEP / 2; y < h; y += STEP) {
      for (let x = STEP / 2; x < w; x += STEP) {
        const wave = Math.sin(x * 0.011 + t) * Math.cos(y * 0.013 - t * 0.8);
        const dx = x - px, dy = y - py;
        const dist2 = dx * dx + dy * dy;
        const near = Math.max(0, 1 - dist2 / (180 * 180));
        const r = Math.max(0.3, base + (reduced ? 0 : wave * amp) + near * 3.2);

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = near > 0.08 || (zb && wave > 0.75) ? accent : ink;
        ctx.globalAlpha = near > 0.08 ? 0.5 : (zb ? 0.16 : 0.1);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);
}
