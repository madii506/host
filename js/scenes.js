// The drawn scenes: the pixel door-coin (and the zoom through it), the PvP split, the flow, the depth chain, the background.
import { fit, clamp, ease, eio, rng, whileVisible } from './util.js';

export const C = { vi: '#8c78ff', vi2: '#c7b9ff', deep: '#2c2270', ink: '#f3f0fb', ivory: '#f1ead7', gold: '#ffb43a', gold2: '#ffd98f', red: '#ff6b81', dim: '#6f6888', line: '#322a47', mint: '#7dffc4', sol: '#9ad7ff' };

// ---------- the door-coin, as a 25 x 25 pixel map: R rim, F face, W door frame, D the door (the inside), L the open leaf, K the knob
const N = 25, MID = 12;
const doorShape = (x, z) => (Math.abs(x) <= 3 && z >= -6 && z <= 3) || (z > 3 && Math.hypot(x, z - 3) <= 3.2);
export const MAP = (() => {
  const m = [];
  for (let j = 0; j < N; j++) {
    const row = [];
    for (let i = 0; i < N; i++) {
      const x = i - MID, z = MID - j, d = Math.hypot(x, z); let t = '.';
      if (d <= 12.3) {
        if (d >= 10.3) t = 'R';
        else if (doorShape(x, z)) t = 'D';
        else if ([-1, 0, 1].some(dx => [-1, 0, 1].some(dz => doorShape(x + dx, z + dz)))) t = 'W';
        else t = 'F';
      }
      row.push(t);
    }
    m.push(row);
  }
  // the leaf, swung open to the left: a narrowing panel from the hinge
  for (let k = 0; k < 4; k++) {
    const x = -4 - k, top = 5 - k, bot = -6 + Math.ceil(k / 2);
    for (let z = bot; z <= top; z++) { const i = x + MID, j = MID - z; if (m[j] && m[j][i] && m[j][i] !== '.') m[j][i] = 'L'; }
  }
  m[MID + 1][MID - 6] = 'K';
  return m;
})();
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = clamp(Math.round(r * f), 0, 255); g = clamp(Math.round(g * f), 0, 255); b = clamp(Math.round(b * f), 0, 255); return `rgb(${r},${g},${b})`; };
const PAL = { R: C.vi2, F: '#3a2c8a', W: C.ivory, L: C.vi, K: C.ivory };
// the colour of each cell, with a light from the top left so the coin reads as a solid thing
const CELL = MAP.map((row, j) => row.map((t, i) => {
  if (t === '.' || t === 'D') return null;
  const x = i - MID, z = MID - j, lit = 1.06 - (x - z) * 0.012;
  if (t === 'R') { const d = Math.hypot(x, z); return shade(C.vi2, (d > 11.4 ? 0.82 : 1) * lit); }
  return shade(PAL[t], lit);
}));
// the inside of a door: dark, with gold light coming from below
function inside(c, x, y, w, h, s) {
  const g = c.createRadialGradient(x + w / 2, y + h * 0.75, 0, x + w / 2, y + h * 0.75, Math.max(w, h) * 0.9);
  g.addColorStop(0, 'rgba(255,190,80,0.95)'); g.addColorStop(0.35, 'rgba(255,150,50,0.55)'); g.addColorStop(1, 'rgba(18,14,30,1)');
  c.fillStyle = '#120e1e'; c.fillRect(x, y, w, h); c.fillStyle = g; c.fillRect(x, y, w, h);
}
// draw one coin with cell size s, centred at (cx, cy); only the cells on screen
export function drawCoin(c, cx, cy, s, W, H, light = true) {
  const x0 = cx - (N / 2) * s, y0 = cy - (N / 2) * s;
  const i0 = Math.max(0, Math.floor(-x0 / s)), i1 = Math.min(N - 1, Math.ceil((W - x0) / s));
  const j0 = Math.max(0, Math.floor(-y0 / s)), j1 = Math.min(N - 1, Math.ceil((H - y0) / s));
  if (light) {   // the door's inside first, as one shape
    c.save(); c.beginPath();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (MAP[j][i] === 'D') c.rect(x0 + i * s - 0.5, y0 + j * s - 0.5, s + 1, s + 1);
    c.clip(); inside(c, x0 + (MID - 4) * s, y0 + (MID - 7) * s, 9 * s, 14 * s, s); c.restore();
  }
  const gap = s > 6 ? Math.max(1, s * 0.07) : 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const col = CELL[j][i]; if (!col) continue;
    c.fillStyle = col; c.fillRect(x0 + i * s, y0 + j * s, s - gap + 0.5, s - gap + 0.5);
  }
}
// the door's inside, as a full screen
export function insideFull(c, W, H) { inside(c, 0, 0, W, H, 1); }

// ---------- the zoom: SOL -> the host -> your coin -> the next one
export function zoom(cv) {
  let P = 0;
  const K = 0.255, LEVELS = 3;
  whileVisible(cv, t => {
    const [c, W, H] = fit(cv); c.clearRect(0, 0, W, H);
    const base = Math.min(W, H) * (W < 700 ? 0.56 : 0.4) / N, S = base * Math.pow(1 / K, P * LEVELS);
    const cx = W / 2, cy = H * (W < 700 ? 0.34 : 0.35) + (H * 0.12) * P + Math.sin(t * 0.8) * 4 * (1 - P);
    // the coin centre sits inside its door: the door's middle is a little below the coin's middle
    const off = 0.4;
    for (let n = 0; n < 6; n++) {
      const s = S * Math.pow(K, n); if (s * N < 3) break;
      const doorW = 7 * s, doorH = 12.5 * s;
      if (doorW > W * 1.2 && doorH > H * 1.2) { insideFull(c, W, H); continue; }   // we're inside this one
      if (s * N > Math.max(W, H) * 14) continue;
      drawCoin(c, cx, cy + off * s, s, W, H);
    }
  });
  return { set(p) { P = p; } };
}

// ---------- D1: PvP, split by a handle you drag
export function pvp(cv, getSplit) {
  const R = rng(5);
  const copies = Array.from({ length: 14 }, (_, i) => ({ x: 0.08 + R() * 0.36, y: 0.2 + R() * 0.62, ph: R() * 6, sp: 0.6 + R() * 0.8, i }));
  const guests = Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * Math.PI * 2, r: 0.34 + R() * 0.1, ph: R(), sp: 0.5 + R() * 0.5 }));
  whileVisible(cv, t => {
    const [c, W, H] = fit(cv); c.clearRect(0, 0, W, H);
    const split = clamp(getSplit(), 0.04, 0.96) * W;
    // the left: PvP
    c.save(); c.beginPath(); c.rect(0, 0, split, H); c.clip();
    c.fillStyle = '#120d14'; c.fillRect(0, 0, W, H);
    c.font = `700 ${Math.max(11, W * 0.012)}px Pix, monospace`; c.textAlign = 'center'; c.fillStyle = C.red;
    if (W > 620) c.fillText('14 COPIES OF ONE NARRATIVE', W * 0.26, H * 0.1);
    copies.forEach(p => {
      const life = ((t * 0.16 * p.sp + p.ph) % 1), x = p.x * W, y = p.y * H, r = Math.max(9, W * 0.016);
      const alive = 1 - ease(clamp((life - 0.55) / 0.45));
      c.globalAlpha = 0.2 + alive * 0.8;
      c.fillStyle = shade('#ff6b81', 0.5 + alive * 0.5); c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
      c.fillStyle = '#1a0d14'; c.font = `700 ${r * 0.9}px Pix, monospace`; c.fillText('$', x, y + r * 0.33);
      // its little chart: up, then down
      c.strokeStyle = C.red; c.lineWidth = 1.6; c.beginPath();
      for (let k = 0; k <= 12; k++) { const u = k / 12, v = Math.sin(Math.min(u, life * 1.8) * Math.PI * 0.9) * (1 - life); c.lineTo(x + r * 1.6 + u * W * 0.06, y + r - v * H * 0.06); }
      c.stroke(); c.globalAlpha = 1;
    });
    c.fillStyle = 'rgba(255,107,129,.85)'; c.font = `700 ${Math.max(10, W * 0.011)}px JB, monospace`; c.textAlign = 'left';
    if (W > 620) c.fillText('LIQUIDITY SPLIT 14 WAYS', W * 0.04, H * 0.93);
    c.restore();
    // the right: on host, the copies live inside the original and feed it
    c.save(); c.beginPath(); c.rect(split, 0, W - split, H); c.clip();
    c.fillStyle = '#120f1d'; c.fillRect(0, 0, W, H);
    const hx = W * 0.74, hy = H * 0.5, s = Math.min(W, H) * 0.42 / N;
    drawCoin(c, hx, hy, s, W, H);
    c.font = `700 ${Math.max(11, W * 0.012)}px Pix, monospace`; c.textAlign = 'center'; c.fillStyle = C.gold2;
    if (W > 620) c.fillText('ONE HOST, FOURTEEN GUESTS', hx, H * 0.1);
    guests.forEach((g, k) => {
      const life = (t * 0.12 * g.sp + g.ph) % 1, a = g.a + t * 0.25, rr = (g.r * (1 - ease(life))) * Math.min(W, H);
      const x = hx + Math.cos(a) * rr * 1.25, y = hy + Math.sin(a) * rr * 0.9, r = Math.max(5, W * 0.009) * (1 - life * 0.6);
      c.globalAlpha = 1 - life * 0.9; c.fillStyle = C.gold; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
      if (k % 3 === 0) { c.strokeStyle = 'rgba(255,180,58,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(hx, hy); c.stroke(); }
      c.globalAlpha = 1;
    });
    // the host's chart: up and to the right
    const gx = W * 0.56, gy = H * 0.9, gw = W * 0.36, gh = H * 0.16;
    c.strokeStyle = C.gold; c.lineWidth = 2; c.beginPath();
    for (let k = 0; k <= 40; k++) { const u = k / 40, v = u * 0.8 + Math.sin(u * 14 + t) * 0.04; c.lineTo(gx + u * gw, gy - v * gh); }
    c.stroke();
    c.fillStyle = C.gold2; c.font = `700 ${Math.max(10, W * 0.011)}px JB, monospace`; c.textAlign = 'right';
    if (W > 620) c.fillText('EVERY BUY FEEDS THE HOST', W * 0.96, H * 0.95);
    c.restore();
  });
}

// ---------- D3: the flow, SOL into the host into your coin
export function flow(cv) {
  const R = rng(9); const parts = Array.from({ length: 46 }, () => ({ ph: R(), sp: 0.5 + R() * 0.4, y: R() - 0.5 }));
  whileVisible(cv, t => {
    const [c, W, H] = fit(cv); c.clearRect(0, 0, W, H);
    const y = H * 0.48, ax = W * 0.1, bx = W * 0.5, cx = W * 0.88, s = Math.min(H * 0.6, W * 0.22) / N;
    // the pipes
    c.strokeStyle = C.line; c.lineWidth = Math.max(10, H * 0.06); c.lineCap = 'round';
    c.beginPath(); c.moveTo(ax, y); c.lineTo(cx, y); c.stroke();
    // SOL
    c.fillStyle = '#0f1a24'; c.strokeStyle = C.sol; c.lineWidth = 3; c.beginPath(); c.arc(ax, y, H * 0.17, 0, 6.283); c.fill(); c.stroke();
    c.fillStyle = C.sol; c.font = `700 ${Math.max(12, H * 0.07)}px Pix, monospace`; c.textAlign = 'center'; c.fillText('SOL', ax, y + H * 0.025);
    // the host
    drawCoin(c, bx, y + 0.4 * s, s, W, H);
    // your coin: a vessel that fills with host
    const vw = H * 0.34, vh = H * 0.5, vx = cx - vw / 2, vy = y - vh / 2, fill = 0.25 + 0.55 * ((t * 0.05) % 1);
    c.fillStyle = '#16121f'; c.strokeStyle = C.gold; c.lineWidth = 2.5; c.beginPath(); c.roundRect(vx, vy, vw, vh, 14); c.fill(); c.stroke();
    c.save(); c.beginPath(); c.roundRect(vx + 4, vy + 4, vw - 8, vh - 8, 10); c.clip();
    const fy = vy + vh - (vh - 8) * fill; const gr = c.createLinearGradient(0, fy, 0, vy + vh); gr.addColorStop(0, 'rgba(140,120,255,.85)'); gr.addColorStop(1, 'rgba(90,70,200,.9)');
    c.fillStyle = gr; c.beginPath(); c.moveTo(vx, fy);
    for (let k = 0; k <= 20; k++) c.lineTo(vx + (k / 20) * vw, fy + Math.sin(t * 3 + k * 0.7) * 3);
    c.lineTo(vx + vw, vy + vh); c.lineTo(vx, vy + vh); c.fill(); c.restore();
    c.fillStyle = C.gold2; c.font = `700 ${Math.max(11, H * 0.05)}px Pix, monospace`; c.fillText('YOUR CURVE', cx, vy - 12);
    c.fillStyle = C.vi2; c.fillText('THE HOST', bx, y - 13.2 * s);
    // the particles: SOL blue until the host, host violet after
    parts.forEach(p => {
      const u = (t * 0.11 * p.sp + p.ph) % 1, x = ax + (cx - vw * 0.5 - ax) * u, yy = y + p.y * H * 0.035;
      if (x > bx - 9 * s && x < bx + 9 * s) return;   // inside the host
      c.fillStyle = x < bx ? C.sol : C.vi; c.beginPath(); c.arc(x, yy, Math.max(2.5, H * 0.012), 0, 6.283); c.fill();
    });
    c.fillStyle = C.dim; c.font = `600 ${Math.max(10, H * 0.04)}px JB, monospace`;
    if (W > 620) { c.fillText('YOU PAY', ax, y + H * 0.29); c.fillText('SWAPPED INTO THE HOST', bx, y + H * 0.36); c.fillText('HELD BY YOUR COIN', cx, y + H * 0.34); }
  });
}

// ---------- D5: the depth chain, a buy dropping through every coin
export function depthChain(cv, onLevel) {
  let last = -1;
  whileVisible(cv, t => {
    const [c, W, H] = fit(cv); c.clearRect(0, 0, W, H);
    const L = 5, top = H * 0.1, step = (H * 0.8) / (L - 1), x = W * 0.5;
    const cyc = (t * 0.32) % 1.25, at = Math.min(L - 1, cyc * L);   // where the buy is
    const lvl = Math.floor(at);
    if (lvl !== last) { last = lvl; onLevel && onLevel(lvl); }
    // the line through them
    c.strokeStyle = C.line; c.lineWidth = 3; c.setLineDash([6, 8]); c.beginPath(); c.moveTo(x, top); c.lineTo(x, top + step * (L - 1)); c.stroke(); c.setLineDash([]);
    for (let i = 0; i < L; i++) {
      const y = top + step * i, lit = i <= at ? 1 - Math.min(1, (at - i) * 0.25) : 0;
      if (i === 0) {
        c.fillStyle = '#0f1a24'; c.strokeStyle = C.sol; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, step * 0.27, 0, 6.283); c.fill(); c.stroke();
        c.fillStyle = C.sol; c.font = `700 ${Math.max(11, step * 0.14)}px Pix, monospace`; c.textAlign = 'center'; c.fillText('SOL', x, y + 4);
      } else {
        const s = (step * 0.58) / N * (1 - i * 0.06);
        if (lit > 0) { c.fillStyle = `rgba(255,180,58,${0.25 * lit})`; c.beginPath(); c.arc(x, y, s * 16, 0, 6.283); c.fill(); }
        drawCoin(c, x, y + 0.4 * s, s, W, H);
      }
      c.fillStyle = i <= at ? C.gold2 : C.dim; c.font = `700 ${Math.max(11, step * 0.12)}px Pix, monospace`; c.textAlign = 'left';
      c.fillText('D' + i, x + step * 0.42, y + 5);
    }
    // the buy
    if (cyc < 1) { const y = top + step * at; c.fillStyle = C.gold; c.beginPath(); c.arc(x - step * 0.42, y, 6, 0, 6.283); c.fill(); c.font = `700 ${Math.max(10, step * 0.1)}px JB, monospace`; c.textAlign = 'right'; c.fillText('A BUY', x - step * 0.5, y + 4); }
  });
}

// ---------- the background: pixel stars, doors opening as rings, gold drifting in
export function background(cv, reduced) {
  const R = rng(17);
  const stars = Array.from({ length: 140 }, () => ({ x: R(), y: R(), s: R() < 0.12 ? 2 : 1, tw: R() * 6 }));
  const motes = Array.from({ length: 16 }, () => ({ x: R(), y: R(), v: 0.004 + R() * 0.01, ph: R() * 6 }));
  const rings = [];
  let last = 0, run = true, raf = 0, nextRing = 0;
  const frame = now => {
    raf = run ? requestAnimationFrame(frame) : 0;
    if (now - last < 40) return; const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const [c, W, H] = fit(cv, 1.5); c.clearRect(0, 0, W, H);
    const t = now / 1000;
    stars.forEach(s => { const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + s.tw)); c.fillStyle = `rgba(199,185,255,${a * 0.55})`; c.fillRect(Math.round(s.x * W), Math.round(s.y * H), s.s, s.s); });
    if (t > nextRing) { rings.push({ x: R() * W, y: R() * H, r: 4, a: 0.5 }); nextRing = t + 1.6 + R() * 1.6; }
    for (let i = rings.length - 1; i >= 0; i--) { const g = rings[i]; g.r += 40 * dt; g.a -= 0.12 * dt; if (g.a <= 0) { rings.splice(i, 1); continue; } c.strokeStyle = `rgba(140,120,255,${g.a * 0.5})`; c.lineWidth = 1; c.beginPath(); c.arc(g.x, g.y, g.r, 0, 6.283); c.stroke(); }
    motes.forEach(m => { m.y -= m.v * dt * 6; if (m.y < -0.02) { m.y = 1.02; m.x = R(); } const x = (m.x + Math.sin(t * 0.4 + m.ph) * 0.01) * W; c.fillStyle = 'rgba(255,180,58,.7)'; c.fillRect(Math.round(x), Math.round(m.y * H), 3, 3); });
  };
  if (reduced) { requestAnimationFrame(frame); return; }
  raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { run = !document.hidden; if (run && !raf) raf = requestAnimationFrame(frame); });
}
