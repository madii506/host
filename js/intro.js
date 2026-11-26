// The intro, kept simple and wordless: a coin appears, a smaller coin drops inside it, one ring goes out, and the site
// fades in. It plays when you arrive, not when you come back from another page of the site. A click or a key skips it.
import { pixCoin, C } from './scenes.js';

const el = document.getElementById('intro');
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const inside = (() => { try { return !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { return false; } })();
const done = () => { document.documentElement.classList.remove('intro-lock'); if (el && el.parentNode) el.remove(); dispatchEvent(new Event('host:intro-done')); };

if (!el) { /* nothing to play */ }
else if (reduced || inside) { el.remove(); }
else {
  document.documentElement.classList.add('intro-lock');
  const cv = el.querySelector('canvas'), c = cv.getContext('2d');
  let W = 0, H = 0;
  const size = () => { const D = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * D); cv.height = Math.round(H * D); c.setTransform(D, 0, 0, D, 0, 0); };
  size(); addEventListener('resize', size);

  const cl = x => Math.max(0, Math.min(1, x));
  const back = x => { const k = 1.70158; return 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); };
  const bounce = x => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
  const T_IN = 0.5, T_DROP = 1.35, T_OUT = 2.05, FADE = 0.6;

  let t0 = 0, outAt = T_OUT, ended = false;
  const skip = () => { const t = (performance.now() - t0) / 1000; if (!ended && t < outAt) outAt = Math.max(0, t); };
  ['click', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, skip, { passive: true, once: true }));
  setTimeout(() => { if (!ended) { ended = true; done(); } }, 6000);   // backstop: the site never stays hidden

  const frame = now => {
    if (ended) return;
    const t = (now - t0) / 1000, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.1;
    const fade = cl((t - outAt) / FADE), grow = 1 + fade * 0.5;
    c.clearRect(0, 0, W, H);
    // the host: a coin pops in
    pixCoin(c, cx, cy, Math.max(1, R * back(cl(t / T_IN)) * grow), '', 'vi');
    // the guest: a smaller coin drops in and lands inside it
    if (t > T_IN * 0.6) {
      const p = cl((t - T_IN * 0.6) / (T_DROP - T_IN * 0.6));
      pixCoin(c, cx, cy - (1 - bounce(p)) * H * 0.5, R * 0.42 * grow, '', 'gold');
    }
    // one ring goes out when it lands
    if (t > T_DROP - 0.1) {
      const q = cl((t - T_DROP + 0.1) / 0.9);
      c.strokeStyle = C.gold; c.globalAlpha = (1 - q) * 0.8; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, R * (1.15 + q * 1.6) * grow, 0, 6.283); c.stroke(); c.globalAlpha = 1;
    }
    el.style.opacity = String(1 - fade);
    if (fade >= 1) { ended = true; done(); return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(now => { t0 = now; frame(now); });
}
