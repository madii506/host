// The intro: no words. A spark becomes a coin, the camera falls through coins inside coins while buys stream in,
// and the last coin opens into the site in a pixel dissolve. Once per visit; a click, a key or a scroll skips it.
import { pixCoin, C } from './scenes.js';

const el = document.getElementById('intro');
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let seen = false; try { seen = sessionStorage.getItem('host:intro') === '1'; } catch { /* storage can be off */ }
const done = () => { document.documentElement.classList.remove('intro-lock'); if (el && el.parentNode) el.remove(); dispatchEvent(new Event('host:intro-done')); };

if (!el) { /* nothing to play */ }
else if (reduced || seen) { el.remove(); }
else {
  try { sessionStorage.setItem('host:intro', '1'); } catch { }
  document.documentElement.classList.add('intro-lock');
  const cv = el.querySelector('canvas'), c = cv.getContext('2d');
  let W = 0, H = 0, D = 1;
  const size = () => { D = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * D); cv.height = Math.round(H * D); c.setTransform(D, 0, 0, D, 0, 0); };
  size(); addEventListener('resize', size);

  const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const back = x => { const k = 1.70158; return 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); };
  const TONES = ['vi', 'gold', 'sol'], Q = 0.32, LEVELS = 4.6;
  const T_POP = 0.75, T_ZOOM = 3.35, T_END = 3.95, T_DISSOLVE = 0.7;
  // the buys: gold pixels that stream in from the edges toward the middle
  const buys = Array.from({ length: 70 }, (_, i) => ({ a: (i * 2.399) % 6.283, d: 1 + (i % 7) * 0.12, v: 0.35 + (i % 5) * 0.09, t0: (i % 14) * 0.18 }));
  // the dissolve: the screen in square cells that clear in a scattered order
  let cells = null, cellPx = 0;
  const makeCells = () => { cellPx = Math.max(18, Math.round(Math.min(W, H) / 22)); cells = []; for (let y = 0; y < H; y += cellPx) for (let x = 0; x < W; x += cellPx) cells.push([x, y, Math.random()]); cells.sort((a, b) => a[2] - b[2]); };

  let t0 = performance.now(), skipAt = null, ended = false;
  const skip = () => { if (skipAt == null && !ended) skipAt = (performance.now() - t0) / 1000; };
  ['click', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, skip, { passive: true, once: true }));
  setTimeout(() => { if (!ended) { ended = true; done(); } }, 9000);   // backstop: the site never stays hidden

  const frame = now => {
    if (ended) return;
    let t = (now - t0) / 1000;
    // a skip jumps straight to the dissolve
    let endAt = T_END;
    if (skipAt != null) endAt = Math.min(T_END, skipAt);
    const cx = W / 2, cy = H / 2, R0 = Math.min(W, H) * 0.17, diag = Math.hypot(W, H);
    c.fillStyle = '#050407'; c.fillRect(0, 0, W, H);

    if (t < T_POP && endAt === T_END) {
      // the spark: one gold pixel that blinks, then the first coin pops out of it
      const p = t / T_POP;
      if (p < 0.45) { const on = Math.floor(p * 14) % 2 === 0; if (on) { const s = 6 + p * 10; c.fillStyle = C.gold; c.fillRect(Math.round(cx - s / 2), Math.round(cy - s / 2), Math.round(s), Math.round(s)); } }
      else { const q = (p - 0.45) / 0.55; pixCoin(c, cx, cy, Math.max(2, R0 * back(Math.min(1, q))), '', 'vi'); }
    } else {
      // the fall: coins inside coins, each one a third the size of the one around it
      const zt = Math.min(1, Math.max(0, (Math.min(t, endAt) - T_POP) / (T_ZOOM - T_POP)));
      const zoom = Math.exp(ease(zt) * LEVELS * Math.log(1 / Q));
      const jStart = Math.floor(Math.log(zoom) / Math.log(1 / Q)) - 3;
      for (let j = jStart; j < jStart + 12; j++) {
        const r = R0 * zoom * Math.pow(Q, j);
        if (r > diag * 2.2 || r < 1.5) continue;
        pixCoin(c, cx, cy, r, '', TONES[((j % 3) + 3) % 3]);
      }
      // the buys, streaming toward the middle
      const bt = Math.min(t, endAt);
      buys.forEach(b => {
        const age = bt - T_POP * 0.6 - b.t0; if (age < 0) return;
        const k = (age * b.v) % 1, dist = (1 - ease(k)) * diag * 0.6 * b.d, s = Math.max(2, 7 * (1 - k));
        const x = cx + Math.cos(b.a) * dist, y = cy + Math.sin(b.a) * dist;
        c.globalAlpha = Math.min(1, k * 4) * 0.9; c.fillStyle = b.d > 1.4 ? C.sol : C.gold2; c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s)); c.globalAlpha = 1;
      });
    }

    // the dissolve: cells clear in a scattered order and the site shows through
    if (t >= endAt) {
      if (!cells) { makeCells(); el.style.background = 'transparent'; }
      const dur = skipAt != null ? 0.35 : T_DISSOLVE, p = Math.min(1, (t - endAt) / dur);
      const n = Math.floor(cells.length * ease(p));
      for (let i = 0; i < n; i++) { const [x, y] = cells[i]; c.clearRect(x, y, cellPx, cellPx); }
      if (p >= 1) { ended = true; done(); return; }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(now => { t0 = now; frame(now); });
}
