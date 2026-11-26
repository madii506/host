// The home page: clean sections, live data from pump.fun and Solana, no scroll tricks.
import './intro.js?v=2';
import { $, $$, esc, clamp, reduced, short } from './util.js';
import { pvp, flow, depthChain, background } from './scenes.js';

background($('#bg'), reduced);
$('#menuBtn') && $('#menuBtn').addEventListener('click', () => $('#dock').classList.toggle('open'));
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const h = a.getAttribute('href'); const el = h.length > 1 && $(h); if (!el) return; e.preventDefault(); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: reduced ? 'auto' : 'smooth' }); $('#dock').classList.remove('open'); }));

// the wordmark: letters settle in once, on load
const wm = $('#wm'); wm.innerHTML = [...wm.textContent].map((ch, i) => `<span class="ch" style="opacity:0;transform:translateY(30px);transition:transform .9s var(--ease) ${0.08 + i * 0.07}s,opacity .7s ${0.08 + i * 0.07}s">${esc(ch)}</span>`).join('');
const heroIn = () => requestAnimationFrame(() => requestAnimationFrame(() => $$('#wm .ch').forEach(s => { s.style.opacity = 1; s.style.transform = 'none'; })));
if (document.getElementById('intro')) addEventListener('host:intro-done', heroIn, { once: true }); else heroIn();

// sections fade in once, gently
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { threshold: 0.1 });
$$('.rv').forEach(el => io.observe(el));

// the marquee
const mq = $('#marq'); let mqx = 0;
const setMarq = html => { if (!mq) return; mq.innerHTML = html + html; mqx = 0; };
if (mq) { setMarq(mq.innerHTML); const tick = () => { mqx = (mqx - 0.5) % (mq.scrollWidth / 2 || 1); mq.style.transform = `translate3d(${mqx}px,0,0)`; requestAnimationFrame(tick); }; if (!reduced) requestAnimationFrame(tick); }

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
const chg = v => v == null ? '' : `<s class="chg ${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '+' : ''}${Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}%</s>`;
const usdK = v => v == null ? '—' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + Math.round(v);
const ico = (src, ch) => src && /^https:\/\//.test(src) ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc((ch || '?').slice(0, 1));
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
  renderHosts(); renderStocks();
  const live = HOSTS.filter(h => h.usd && h.symbol).slice(0, 18);
  if (live.length) setMarq(live.map((h, i) => `<em class="tk"><span>$${esc(h.symbol.replace(/^\$/, ''))}</span><b class="num">${price(h.usd)}</b>${chg(h.ch24h)}</em><i></i>${i % 6 === 5 ? '<span>EVERY BUY FEEDS THE HOST</span><i></i>' : ''}`).join(''));
  const pick = ['ETH', 'WBTC', 'PUMP', '$WIF', 'Bonk', 'TRUMP'];
  const rank = h => { const i = pick.indexOf(h.symbol); return i < 0 ? 99 : i; };
  const top = HOSTS.filter(h => h.usd).sort((a, b) => rank(a) - rank(b) || (b.liq || 0) - (a.liq || 0));
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

// 06: stocks, as a board
let stockShown = 12;
function renderStocks() {
  const box = $('#stockBoard'), more = $('#stockMore'); if (!box) return;
  const st = HOSTS.filter(h => h.cat === 'stock' && h.symbol);
  put('#nStock2', st.length);
  if (!st.length) { box.innerHTML = '<div class="hempty">No stock hosts on pump.fun\'s list right now.</div>'; more.hidden = true; return; }
  box.innerHTML = '<div class="srow hd"><span>Stock</span><span>Price</span><span>24h</span><span></span></div>' + st.slice(0, stockShown).map(h => `<a class="srow" href="/app#host=${esc(h.mint)}"><span class="sk"><span class="ic">${ico(h.icon, h.symbol)}</span><b>${esc(h.symbol)}</b><i>${esc((h.name || '').replace(/ ?- ?Backpack.*$/i, ''))}</i></span><span class="num">${price(h.usd)}</span><span>${chg(h.ch24h) || '<s class="chg">—</s>'}</span><span class="go">Launch inside <span class="ar">→</span></span></a>`).join('');
  more.hidden = st.length <= stockShown;
}
$('#stockMore') && $('#stockMore').addEventListener('click', () => { stockShown += 12; renderStocks(); });

// 05: what's trending on pump.fun right now, and the newest coins
let PUMP = { trending: [], fresh: [] }, trTab = 'trending';
function renderTrending() {
  const box = $('#trGrid'); if (!box) return;
  const list = PUMP[trTab] || [];
  if (!list.length) { box.innerHTML = `<div class="hempty">${trTab === 'fresh' ? 'No new pump coins in the feed right now.' : 'Jupiter\'s trending list didn\'t answer. Refresh in a moment.'}</div>`; return; }
  box.innerHTML = list.slice(0, 15).map((c, i) => `<a class="hcard tr" style="animation-delay:${i * 0.02}s" href="/app#host=${esc(c.mint)}"><span class="ic">${ico(c.icon, c.symbol)}</span><b>${esc(c.symbol || short(c.mint, 4))}</b><span>${esc(c.name || '')}</span><em><i>${usdK(c.mcap)} <small>MCAP</small></i>${chg(trTab === 'fresh' ? c.ch24h ?? c.ch1h : c.ch1h)}</em><u>Launch inside →</u></a>`).join('');
}
$$('#trTabs .chip').forEach(b => b.addEventListener('click', () => { trTab = b.dataset.t; $$('#trTabs .chip').forEach(x => x.classList.toggle('on', x === b)); renderTrending(); }));

// the hero: one live card, cycling through what's trending
const lv = $('#live'); let lvItems = [], lvAt = 0, lvHold = false, lvTimer = 0;
function lvShow(i) {
  const c = lvItems[i]; if (!c) return;
  lv.href = '/app#host=' + c.mint;
  $('#lvIc').innerHTML = ico(c.icon, c.symbol); $('#lvSym').textContent = '$' + String(c.symbol || '').replace(/^\$/, ''); $('#lvName').textContent = c.name || '';
  $('#lvPx').textContent = c.mcap ? usdK(c.mcap) + ' mcap' : price(c.usd); $('#lvCh').outerHTML = chg(c.ch1h ?? c.ch24h).replace('<s class="chg', '<s id="lvCh" class="chg') || '<s id="lvCh" class="chg"></s>';
  $$('#lvDots i').forEach((d, k) => d.classList.toggle('on', k === i));
}
function lvNext() { if (lvHold || document.hidden || lvItems.length < 2) return; lv.classList.add('fade'); setTimeout(() => { lvAt = (lvAt + 1) % lvItems.length; lvShow(lvAt); lv.classList.remove('fade'); }, 420); }
if (lv) { lv.addEventListener('mouseenter', () => (lvHold = true)); lv.addEventListener('mouseleave', () => (lvHold = false)); }

fetch('/api/pump').then(r => r.json()).then(j => {
  if (!j || !j.ok) throw new Error();
  PUMP = j; renderTrending(); pvpLive();
  lvItems = j.trending.filter(c => c.symbol).slice(0, 8);
  if (lv && lvItems.length) {
    $('#lvDots').innerHTML = lvItems.map(() => '<i></i>').join('');
    lvShow(0); lv.hidden = false; requestAnimationFrame(() => lv.classList.add('in'));
    if (!reduced) lvTimer = setInterval(lvNext, 4600);
  }
}).catch(() => { const b = $('#trGrid'); if (b) b.innerHTML = '<div class="hempty">Jupiter\'s trending list didn\'t answer. Refresh in a moment.</div>'; });

// 01, measured: of this hour's hottest tickers on pump.fun, the one shared by the most tokens
async function pvpLive() {
  const syms = [...new Set((PUMP.trending || []).map(c => c.symbol).filter(Boolean))].slice(0, 8);
  const res = await Promise.all(syms.map(sy => fetch('/api/copies?symbol=' + encodeURIComponent(sy)).then(r => r.json()).catch(() => null)));
  const j = res.filter(x => x && x.ok && x.count >= 3).sort((a, b) => b.count - a.count)[0];
  if (!j) return;
  const top = j.coins[0];
  $('#plText').innerHTML = `Jupiter lists <b>${j.capped ? 'at least ' : ''}${j.count} tokens called $${esc(j.symbol)}</b>, one of this hour's hottest tickers on pump.fun.${top && top.mcap ? ` The biggest is worth ${usdK(top.mcap)}.` : ''} Each one competes with the rest for the same buyers. On host, they could all launch inside the first.`;
  $('#plRow').innerHTML = j.coins.map((c, i) => `<span class="plc${i === 0 ? ' top' : ''}" title="${esc(c.name || '')}"><span class="ic">${ico(c.icon, j.symbol)}</span>${usdK(c.mcap)}</span>`).join('');
  $('#pvpLive').hidden = false;
}
