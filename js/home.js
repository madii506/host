// The home page: clean sections, live data from pump.fun and Solana, no scroll tricks.
import { $, $$, esc, clamp, reduced, short } from './util.js';
import { pvp, flow, depthChain, background } from './scenes.js';

background($('#bg'), reduced);
$('#menuBtn') && $('#menuBtn').addEventListener('click', () => $('#dock').classList.toggle('open'));
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const h = a.getAttribute('href'); const el = h.length > 1 && $(h); if (!el) return; e.preventDefault(); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: reduced ? 'auto' : 'smooth' }); $('#dock').classList.remove('open'); }));

// the wordmark: letters settle in once, on load
const wm = $('#wm'); wm.innerHTML = [...wm.textContent].map((ch, i) => `<span class="ch" style="opacity:0;transform:translateY(30px);transition:transform .9s var(--ease) ${0.08 + i * 0.07}s,opacity .7s ${0.08 + i * 0.07}s">${esc(ch)}</span>`).join('');
requestAnimationFrame(() => requestAnimationFrame(() => $$('#wm .ch').forEach(s => { s.style.opacity = 1; s.style.transform = 'none'; })));

// sections fade in once, gently
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { threshold: 0.1 });
$$('.rv').forEach(el => io.observe(el));

// the marquee
const mq = $('#marq'); if (mq) { mq.innerHTML += mq.innerHTML; let x = 0; const tick = () => { x = (x - 0.5) % (mq.scrollWidth / 2); mq.style.transform = `translate3d(${x}px,0,0)`; requestAnimationFrame(tick); }; if (!reduced) requestAnimationFrame(tick); }

// 01: the split you drag (it sways on its own until you touch it)
let split = 0.5, held = false, touched = false;
const vs = $('#vs'), knob = $('#vsKnob');
pvp($('#vsCv'), () => { if (!touched && !reduced) split = 0.5 + Math.sin(performance.now() / 1700) * 0.2; knob.style.left = (split * 100) + '%'; return split; });
const setSplit = e => { const r = vs.getBoundingClientRect(); split = clamp((e.clientX - r.left) / r.width, 0.04, 0.96); };
vs.addEventListener('pointerdown', e => { held = touched = true; setSplit(e); vs.setPointerCapture(e.pointerId); });
vs.addEventListener('pointermove', e => { if (held) setSplit(e); });
vs.addEventListener('pointerup', () => (held = false));

// 03 and 06
flow($('#flowCv'));
depthChain($('#depthCv'), lvl => $$('#depthList > div').forEach((d, i) => d.classList.toggle('on', i === lvl)));

// live numbers
const price = v => v == null ? '—' : v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : v >= 1 ? '$' + v.toFixed(2) : v >= 0.01 ? '$' + v.toFixed(4) : '$' + Number(v.toPrecision(3));
const put = (sel, v) => { const e = $(sel); if (e) e.textContent = v; };
const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

// 04: hosts
const grid = $('#hostGrid'), more = $('#hostMore'), q = $('#hostQ');
let HOSTS = [], cat = 'all', shown = 24, solUsd = null;
function renderHosts() {
  const s = q.value.trim().toLowerCase();
  const list = HOSTS.filter(h => (cat === 'all' || h.cat === cat) && (!s || `${h.symbol} ${h.name}`.toLowerCase().includes(s) || h.mint === q.value.trim()));
  if (!list.length) { grid.innerHTML = `<div class="hempty">No host matches "${esc(q.value)}". Any pump coin can host too: check it below.</div>`; more.hidden = true; return; }
  grid.innerHTML = list.slice(0, shown).map((h, i) => `<a class="hcard" style="animation-delay:${Math.min(i, 20) * 0.02}s" href="/app#host=${esc(h.mint)}"><span class="ic">${h.icon ? `<img src="${esc(h.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc((h.symbol || '?').slice(0, 1))}</span><b>${esc(h.symbol || short(h.mint, 4))}</b><span>${esc(h.name || '')}</span><em><i>${price(h.usd)}</i>Launch inside →</em></a>`).join('');
  more.hidden = list.length <= shown;
}
$$('#hostCats .chip').forEach(b => b.addEventListener('click', () => { cat = b.dataset.c; shown = 24; $$('#hostCats .chip').forEach(x => x.classList.toggle('on', x === b)); renderHosts(); }));
q.addEventListener('input', () => { shown = 24; renderHosts(); });
more.addEventListener('click', () => { shown += 24; renderHosts(); });

// 07: the calculator
const cHost = $('#cHost'), cSol = $('#cSol');
const fmtN = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n >= 1 ? n.toFixed(2) : Number(n.toPrecision(3)).toString();
function calc() {
  const sol = +cSol.value; $('#cSolV').textContent = sol + ' SOL';
  const h = HOSTS.find(x => x.mint === cHost.value);
  if (!h || !h.usd || !solUsd) { $('#cOut').innerHTML = `—<small>${h ? 'No live price for this host right now.' : 'Pick a host.'}</small>`; ['#cPx', '#cIn', '#cHeld'].forEach(s => ($(s).textContent = '—')); return; }
  const n = sol * solUsd / h.usd, usd = Math.round(sol * solUsd).toLocaleString('en-US');
  $('#cOut').innerHTML = `${fmtN(n)} <span style="font-size:.45em">${esc(h.symbol)}</span><small>about $${usd} of ${esc(h.symbol)} bought on the way in</small>`;
  $('#cPx').textContent = price(h.usd); $('#cIn').textContent = `${sol} SOL · $${usd}`; $('#cHeld').textContent = `${fmtN(n)} ${h.symbol}`;
}
cSol.addEventListener('input', calc); cHost.addEventListener('change', calc);

fetch('/api/hosts').then(r => r.json()).then(j => {
  if (!j || !j.ok) throw new Error();
  HOSTS = j.hosts; solUsd = j.solUsd || null;
  const n = k => HOSTS.filter(h => k === 'all' || h.cat === k).length;
  $('#nAll').textContent = n('all'); $('#nCrypto').textContent = n('crypto'); $('#nMeme').textContent = n('meme'); $('#nStock').textContent = n('stock');
  put('#stHosts', HOSTS.length);
  if (j.maxDepth) { put('#stDepth', j.maxDepth); const w = WORD[j.maxDepth] || j.maxDepth; $('#depthN').textContent = w; $('#depthN2').textContent = w; $$('.depthN3').forEach(e => (e.textContent = w)); }
  renderHosts();
  const pick = ['ETH', 'WBTC', 'PUMP', '$WIF', 'Bonk', 'TRUMP'];
  const top = HOSTS.filter(h => h.usd).sort((a, b) => (pick.indexOf(b.symbol) >= 0) - (pick.indexOf(a.symbol) >= 0) || (b.liq || 0) - (a.liq || 0));
  cHost.innerHTML = top.map(h => `<option value="${esc(h.mint)}">${esc(h.symbol)} · ${esc(h.name || '')}</option>`).join('');
  calc();
}).catch(() => { grid.innerHTML = '<div class="hempty">pump.fun\'s host list didn\'t load. Refresh in a moment.</div>'; cHost.innerHTML = '<option value="">Hosts didn\'t load</option>'; });

// 05: check any coin
const ckForm = $('#ckForm'), ckIn = $('#ckIn'), ckOut = $('#ckOut');
ckForm.addEventListener('submit', async e => {
  e.preventDefault(); const m = ckIn.value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)) { ckOut.innerHTML = '<div class="ckres"><span class="ic">?</span><div><b>That isn\'t a Solana address.</b><span>Paste a coin\'s contract address.</span></div></div>'; return; }
  const btn = ckForm.querySelector('button'), label = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Asking pump.fun…';
  try {
    const r = await fetch('/api/check?mint=' + encodeURIComponent(m)).then(x => x.json());
    if (!r.ok) throw new Error(r.error || 'The check did not finish.');
    const name = r.symbol ? '$' + r.symbol : short(m, 5);
    ckOut.innerHTML = r.can
      ? `<div class="ckres"><span class="ic">${r.icon ? `<img src="${esc(r.icon)}" alt="" referrerpolicy="no-referrer">` : esc((r.symbol || '?').slice(0, 1))}</span><div><b>${esc(name)} can host.</b><span>${esc(r.name || '')}</span></div><span class="verdict y">CAN HOST</span>
         <div class="facts"><div><small>From</small><strong>${r.source === 'pumpCoin' ? 'a pump coin' : r.source === 'quoteControl' ? "pump.fun's list" : 'pump.fun'}</strong></div><div><small>Your coin's depth</small><strong>${r.source === 'pumpCoin' ? `D${r.depth} of ${r.maxDepth || 5}` : 'D0 · a root coin'}</strong></div><div><small>Price</small><strong>${price(r.usd)}</strong></div><div><small>Contract</small><strong>${esc(short(m, 6))}</strong></div></div>
         <div class="act"><a class="btn g" href="/app#host=${esc(m)}">Launch inside ${esc(name)} <span class="ar">→</span></a><a class="btn o" href="https://pump.fun/coin/${esc(m)}" target="_blank" rel="noopener">${esc(name)} on pump.fun ↗</a></div></div>`
      : `<div class="ckres"><span class="ic">✕</span><div><b>${esc(name)} can't host.</b><span>${esc(r.error || '')}</span></div><span class="verdict n">CAN'T HOST</span></div>`;
  } catch (x) { ckOut.innerHTML = `<div class="ckres"><span class="ic">!</span><div><b>The check didn't finish.</b><span>${esc(x.message || '')}</span></div></div>`; }
  btn.disabled = false; btn.innerHTML = label;
});

// 09: guests
const ago = t => { if (!t) return ''; const s = Math.max(0, Date.now() / 1000 - t); return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
fetch('/api/list').then(r => r.json()).then(j => {
  const box = $('#guestList'); if (!j || !j.ok) throw new Error();
  put('#stGuests', j.count); put('#nGuests', j.count ? j.count + ' so far' : '');
  if (!j.coins.length) { box.innerHTML = `<div class="gempty"><img src="/img/sp-gold.webp" alt=""><b>No guests yet.</b><span>The first coin launched inside a host through host shows up here, with the coin it lives in.</span><a class="btn g" href="/app">Launch the first one <span class="ar">→</span></a></div>`; return; }
  box.innerHTML = j.coins.slice(0, 12).map(c => `<a class="grow" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener"><span class="ic">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc((c.symbol || '?').slice(0, 1))}</span><span class="nm"><b>${esc(c.symbol ? '$' + c.symbol : short(c.mint, 4))}</b><i>${esc(c.name || '')}</i></span><span class="in">inside <b>${esc(c.hostSymbol ? '$' + c.hostSymbol : short(c.host, 4))}</b></span><span class="bar"><i style="width:${Math.max(2, c.curve || 0)}%"></i><em>${c.complete ? 'GRADUATED' : c.curve != null ? Math.round(c.curve) + '% TO GRADUATE' : 'ON THE CURVE'}</em></span><span class="age">${ago(c.time)}</span></a>`).join('');
}).catch(() => { $('#guestList').innerHTML = '<div class="gempty"><b>The chain didn\'t answer.</b><span>Refresh in a moment.</span></div>'; });
