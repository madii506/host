// The home page: a zoom through nested coins, then each section is one depth further in.
import { $, $$, esc, clamp, reduced, short, toast } from './util.js';
import { zoom, pvp, flow, depthChain, background } from './scenes.js';

const html = document.documentElement;
background($('#bg'), reduced);

// smooth scroll
let lenis = null;
if (!reduced && window.Lenis) { lenis = new window.Lenis({ lerp: 0.095, smoothWheel: true }); }
const go = sel => { const el = $(sel); if (!el) return; lenis ? lenis.scrollTo(el, { offset: -10 }) : el.scrollIntoView({ behavior: 'smooth' }); };
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const h = a.getAttribute('href'); if (h.length > 1) { e.preventDefault(); go(h); $('#dock').classList.remove('open'); } }));
$('#menuBtn') && $('#menuBtn').addEventListener('click', () => $('#dock').classList.toggle('open'));

// the wordmark: letters drop in
const wm = $('#wm'); wm.innerHTML = [...wm.textContent].map((ch, i) => `<span class="ch" style="transition:transform 1s var(--ease) ${0.1 + i * 0.08}s,opacity .8s ${0.1 + i * 0.08}s">${esc(ch)}</span>`).join('');
$$('#wm .ch').forEach(s => { s.style.opacity = 0; s.style.transform = 'translateY(40px) scale(.8)'; });
requestAnimationFrame(() => requestAnimationFrame(() => $$('#wm .ch').forEach(s => { s.style.opacity = 1; s.style.transform = 'none'; })));

// the zoom through the doors
const Z = zoom($('#doorCv'));
const zsec = $('#top'), heroIn = $('#heroIn'), zl = $$('#zlabel > div'), hint = $('#zhint'), floats = $$('#top .float');
// sideways track
const tsec = $('#how'), track = $('#track'), tbar = $('#trackBar');
// marquees
const mq = [$('#marq'), $('#marq2')]; let mqx = [0, 0];
mq.forEach(m => { if (m) m.innerHTML += m.innerHTML; });
// split headings into words
$$('.split').forEach(h => { const walk = n => [...n.childNodes].forEach(ch => { if (ch.nodeType === 3) { const f = document.createDocumentFragment(); ch.textContent.split(/(\s+)/).forEach(p => { if (!p) return; if (/^\s+$/.test(p)) f.append(p); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = p; f.append(s); } }); ch.replaceWith(f); } else if (ch.nodeType === 1 && ch.tagName !== 'BR') walk(ch); }); walk(h); $$('.w', h).forEach((w, i) => (w.style.transitionDelay = (i * 0.05) + 's')); });
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
$$('.rv, .split').forEach(el => io.observe(el));

// the dock and the depth rail
const dock = $('#dock'), rail = $('#rail'), railD = $('#railD');
const secs = ['pvp', 'how', 'flow', 'hosts', 'depth', 'calc', 'guests', 'rules', 'faq'].map(id => $('#' + id));
let lastSec = -1;
function onScroll(y) {
  const vh = innerHeight;
  // the zoom
  const r = zsec.getBoundingClientRect(), span = zsec.offsetHeight - vh, p = clamp(-r.top / span);
  Z.set(p);
  heroIn.style.opacity = clamp(1 - p * 9); heroIn.style.transform = `translateX(-50%) translateY(${-p * 120}px) scale(${1 - p * 0.3})`;
  heroIn.style.pointerEvents = p > 0.08 ? 'none' : '';
  hint.style.opacity = clamp(1 - p * 12);
  const zi = p < 0.07 || p > 0.985 ? -1 : Math.min(3, Math.round(p * 3));
  zl.forEach((d, i) => d.classList.toggle('on', i === zi));
  floats.forEach(f => { const k = +f.dataset.par || 0.5; f.style.transform = `translate3d(0, ${-p * 260 * k}px, 0) scale(${1 + p * k * 1.6})`; f.style.opacity = clamp(1 - p * 2.2); });
  // the dock shows once you're through the first coin
  dock.classList.toggle('on', p > 0.96 || r.bottom < vh * 0.5);
  rail.classList.toggle('on', r.bottom < vh * 0.6);
  // which depth
  let cur = -1; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < vh * 0.5) cur = i; });
  if (cur !== lastSec) { lastSec = cur; $$('#rail a').forEach((a, i) => a.classList.toggle('on', i === cur)); $$('#dock a[href^="#"]').forEach(a => a.classList.toggle('on', secs[cur] && a.getAttribute('href') === '#' + secs[cur].id)); railD.textContent = 'D' + (cur + 1); }
  // the sideways track
  const tr = tsec.getBoundingClientRect(), tspan = tsec.offsetHeight - vh, tp = clamp(-tr.top / tspan);
  const max = Math.max(0, track.scrollWidth - innerWidth);
  track.style.transform = `translate3d(${-tp * max}px,0,0)`; tbar.style.width = (tp * 100) + '%';
}
let sy = 0;
if (lenis) { lenis.on('scroll', e => { sy = e.scroll; onScroll(sy); }); }
else addEventListener('scroll', () => { sy = scrollY; onScroll(sy); }, { passive: true });
addEventListener('resize', () => onScroll(scrollY));
function loop(t) {
  requestAnimationFrame(loop);
  if (lenis) lenis.raf(t);
  // marquees drift both ways
  mq.forEach((m, i) => { if (!m) return; mqx[i] = (mqx[i] + (i ? 0.5 : -0.6)) % (m.scrollWidth / 2); m.style.transform = `translate3d(${i ? mqx[i] - m.scrollWidth / 2 : mqx[i]}px,0,0)`; });
}
requestAnimationFrame(loop);
onScroll(0);

// D1: the split you drag (it sways on its own until you touch it)
let split = 0.5, held = false, touched = false;
const vs = $('#vs'), knob = $('#vsKnob');
pvp($('#vsCv'), () => { if (!touched) split = 0.5 + Math.sin(performance.now() / 1600) * 0.22; knob.style.left = (split * 100) + '%'; return split; });
const setSplit = e => { const r = vs.getBoundingClientRect(); split = clamp((e.clientX - r.left) / r.width, 0.04, 0.96); };
vs.addEventListener('pointerdown', e => { held = touched = true; setSplit(e); vs.setPointerCapture(e.pointerId); });
vs.addEventListener('pointermove', e => { if (held) setSplit(e); });
vs.addEventListener('pointerup', () => (held = false));

// D3 and D5
flow($('#flowCv'));
depthChain($('#depthCv'), lvl => $$('#depthList > div').forEach((d, i) => d.classList.toggle('on', i === lvl)));

// D4: the hosts, live from pump.fun's quote list
const grid = $('#hostGrid'), more = $('#hostMore'), q = $('#hostQ');
let HOSTS = [], cat = 'all', shown = 24, solUsd = null;
const price = v => v == null ? '—' : v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : v >= 1 ? '$' + v.toFixed(2) : v >= 0.01 ? '$' + v.toFixed(4) : '$' + v.toPrecision(3);
function renderHosts() {
  const s = q.value.trim().toLowerCase();
  const list = HOSTS.filter(h => (cat === 'all' || h.cat === cat) && (!s || (h.symbol + ' ' + h.name).toLowerCase().includes(s) || h.mint === q.value.trim()));
  if (!list.length) { grid.innerHTML = `<div class="hempty">No host matches "${esc(q.value)}". Any pump coin can host too: paste its contract in the app.</div>`; more.hidden = true; return; }
  grid.innerHTML = list.slice(0, shown).map((h, i) => `<a class="hcard" style="animation-delay:${Math.min(i, 20) * 0.025}s" href="/app#launch=${esc(h.mint)}"><span class="ic">${h.icon ? `<img src="${esc(h.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc((h.symbol || '?').slice(0, 1))}</span><b>${esc(h.symbol || short(h.mint, 4))}</b><span>${esc(h.name || '')}</span><em><i>${price(h.usd)}</i>Launch inside →</em></a>`).join('');
  more.hidden = list.length <= shown;
}
$$('#hostCats .chip').forEach(b => b.addEventListener('click', () => { cat = b.dataset.c; shown = 24; $$('#hostCats .chip').forEach(x => x.classList.toggle('on', x === b)); renderHosts(); }));
q.addEventListener('input', () => { shown = 24; renderHosts(); });
more.addEventListener('click', () => { shown += 24; renderHosts(); });

// D6: the calculator
const cHost = $('#cHost'), cSol = $('#cSol');
function calc() {
  const sol = +cSol.value; $('#cSolV').textContent = sol + ' SOL';
  const h = HOSTS.find(x => x.mint === cHost.value);
  if (!h || !h.usd || !solUsd) { $('#cOut').innerHTML = `—<small>${h ? 'No live price for this host right now.' : 'Pick a host.'}</small>`; ['#cPx', '#cIn', '#cHeld'].forEach(s => ($(s).textContent = '—')); return; }
  const n = sol * solUsd / h.usd, fmt = n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n >= 1 ? n.toFixed(2) : n.toPrecision(3);
  $('#cOut').innerHTML = `${fmt} <span style="font-size:.5em">$${esc(h.symbol)}</span><small>about $${Math.round(sol * solUsd).toLocaleString('en-US')} of ${esc(h.symbol)} bought on the way in</small>`;
  $('#cPx').textContent = price(h.usd); $('#cIn').textContent = `${sol} SOL · $${Math.round(sol * solUsd).toLocaleString('en-US')}`; $('#cHeld').textContent = `${fmt} ${h.symbol}`;
}
cSol.addEventListener('input', calc); cHost.addEventListener('change', calc);

fetch('/api/hosts').then(r => r.json()).then(j => {
  if (!j || !j.ok) throw new Error(j && j.error);
  HOSTS = j.hosts; solUsd = j.solUsd || null;
  $('#hostsTag').textContent = `Live · ${HOSTS.length} hosts on pump.fun`;
  renderHosts();
  const pick = ['ETH', 'WBTC', 'PUMP', '$WIF', 'Bonk', 'SPX'];
  const top = [...HOSTS].filter(h => h.usd).sort((a, b) => (pick.indexOf(b.symbol) >= 0) - (pick.indexOf(a.symbol) >= 0) || (b.liq || 0) - (a.liq || 0));
  cHost.innerHTML = top.map(h => `<option value="${esc(h.mint)}">${esc(h.symbol)} · ${esc(h.name || '')}</option>`).join('');
  calc();
}).catch(() => { grid.innerHTML = '<div class="hempty">pump.fun\'s host list didn\'t load. Refresh in a moment.</div>'; cHost.innerHTML = '<option value="">Hosts didn\'t load</option>'; });

// D7: guests, launched through host
const ago = t => { if (!t) return ''; const s = Math.max(0, Date.now() / 1000 - t); return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
fetch('/api/list').then(r => r.json()).then(j => {
  const box = $('#guestList');
  if (!j || !j.ok) throw new Error();
  if (!j.coins.length) { box.innerHTML = `<div class="gempty"><img src="/img/sp-door.webp" alt=""><b>No guests yet.</b><span>The first coin launched inside a host through host shows up here, with the coin it lives in.</span><a class="btn g" href="/app">Launch the first one <span class="ar">→</span></a></div>`; return; }
  box.innerHTML = j.coins.slice(0, 12).map(c => `<a class="grow" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener"><span class="ic">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc((c.symbol || '?').slice(0, 1))}</span><span class="nm"><b>${esc(c.symbol ? '$' + c.symbol : short(c.mint, 4))}</b><i>${esc(c.name || '')}</i></span><span class="in">inside <b>${esc(c.hostSymbol ? '$' + c.hostSymbol : short(c.host, 4))}</b></span><span class="bar"><i style="width:${Math.max(2, c.curve || 0)}%"></i><em>${c.curve != null ? Math.round(c.curve) + '% TO GRADUATE' : 'ON THE CURVE'}</em></span><span class="age">${ago(c.time)}</span></a>`).join('');
}).catch(() => { $('#guestList').innerHTML = '<div class="gempty"><b>The chain didn\'t answer.</b><span>Refresh in a moment.</span></div>'; });
void toast;
