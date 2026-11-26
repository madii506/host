// The host app: launch a pump.fun coin inside a host coin, the guests launched through host, and the checker.
// The launch: the image and details go to IPFS through pump.fun's own upload, host builds one transaction with pump.fun's
// own program and tries it against Solana, your wallet signs, this page signs for the new coin's address (a key made here
// that never leaves the page), and Solana confirms.
import { $, $$, esc, short, store, toast, copy, reduced, fit, whileVisible } from './util.js';
import { pixCoin, background, C } from './scenes.js';
import { wallet } from './wallet.js';
import * as ed from '../vendor/ed25519.js';

background($('#bg'), reduced);
const SITE = location.origin, SOL58 = 'So11111111111111111111111111111111111111112';
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of bytes) { if (x === 0) s = '1' + s; else break; } return s; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || '').trim());
const price = v => v == null ? '—' : v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : v >= 1 ? '$' + v.toFixed(2) : v >= 0.01 ? '$' + v.toFixed(4) : '$' + Number(v.toPrecision(3));
const fmtN = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n >= 1 ? (+n.toFixed(2)).toString() : Number(n.toPrecision(3)).toString();
const ago = t => { if (!t) return ''; const s = Math.max(0, Date.now() / 1000 - t); return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
const icon = (src, ch) => src && /^https:\/\//.test(src) ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc((ch || '?').slice(0, 1));
async function api(op, body, q = '') {
  const r = await fetch('/api/' + op + q, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  let j = null; try { j = await r.json(); } catch { /* not JSON */ }
  if (!j || !j.ok) { const e = new Error((j && j.error) || `The server did not answer (${r.status}). Try again.`); e.code = j && j.code; throw e; }
  return j;
}

// ---------- the new coin's address signs the exact message the wallet signed
function cu16(b, o) { let len = 0, size = 0; for (;;) { const e = b[o + size]; len |= (e & 0x7f) << (size * 7); size++; if (!(e & 0x80)) break; } return [len, size]; }
async function signAsMint(tx, pub, seed) {
  const [n, s] = cu16(tx, 0), msg = tx.subarray(s + n * 64);
  let o = msg[0] & 0x80 ? 1 : 0; const nReq = msg[o]; o += 3;
  const [nk, ks] = cu16(msg, o); o += ks;
  let at = -1;
  for (let i = 0; i < Math.min(nReq, nk, n); i++) { const k = msg.subarray(o + i * 32, o + i * 32 + 32); if (k.every((x, j) => x === pub[j])) { at = i; break; } }
  if (at < 0) throw new Error('The wallet changed the launch so the new coin no longer signs it. Nothing was sent.');
  if (tx.subarray(s, s + 64).every(x => x === 0)) throw new Error('The wallet did not sign. Nothing was sent.');
  const sig = await ed.signAsync(msg, seed), full = new Uint8Array(tx);
  full.set(sig, s + at * 64); return full;
}

// ---------- nav, tabs and routes
$('#menuBtn').addEventListener('click', () => $('#dock').classList.toggle('open'));
const panels = $$('[data-panel]');
function show(name) {
  if (!panels.some(p => p.dataset.panel === name)) name = 'launch';
  panels.forEach(p => (p.hidden = p.dataset.panel !== name));
  $$('.tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
  $$('#dock a[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === name));
  if (name === 'guests') loadGuests();
  $('#dock').classList.remove('open');
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const m = /^host=([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(h);
  if (m) { show('launch'); if (!host || host.mint !== m[1]) setHost(m[1]); return; }
  const c = /^check=([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(h);
  if (c) { show('check'); ckIn.value = c[1]; ckForm.requestSubmit(); return; }
  show(h || 'launch');
}
$$('.tab').forEach(t => t.addEventListener('click', () => { history.replaceState(null, '', '#' + t.dataset.tab); route(); }));
addEventListener('hashchange', route);

// ---------- the host
let HOSTS = [], host = null, bal = null, checking = 0;
const hCur = $('#hCur'), hStat = $('#hStat'), hOpts = $('#hOpts'), hIn = $('#hIn');
function renderHost() {
  if (!host) { hCur.innerHTML = `<span class="ic">?</span><div><b>Pick a host</b><span>The coin yours will live inside.</span></div><span class="hstat" id="hStat"></span>`; }
  else {
    const where = host.source === 'pumpCoin' ? `A pump coin · your coin sits at D${host.depth}` : host.source === 'quoteControl' ? "On pump.fun's host list" : 'Listed on pump.fun';
    hCur.innerHTML = `<span class="ic">${icon(host.icon, host.symbol)}</span><div><b>${esc(host.symbol ? '$' + host.symbol : short(host.mint, 5))}</b><span>${esc(host.name ? host.name + ' · ' : '')}${esc(where)}</span></div><span class="hstat ok" id="hStat">CAN HOST</span>`;
  }
  $$('#hOpts button, #hTrend button').forEach(b => b.classList.toggle('on', !!host && b.dataset.m === host.mint));
}
async function setHost(m) {
  m = String(m || '').trim();
  const st = $('#hStat');
  if (!isAddr(m)) { st.className = 'hstat bad'; st.textContent = "That isn't a Solana address."; return; }
  if (m === SOL58) { st.className = 'hstat bad'; st.textContent = 'Every normal pump.fun coin is priced in SOL. Pick a coin to launch inside.'; return; }
  const my = ++checking; st.className = 'hstat'; st.textContent = 'Asking pump.fun…';
  try {
    const r = await api('check', null, '?mint=' + encodeURIComponent(m));
    if (my !== checking) return;
    if (!r.can) { st.className = 'hstat bad'; st.textContent = r.error || "That coin can't host."; return; }
    const known = HOSTS.find(h => h.mint === m) || {};
    host = { mint: m, symbol: r.symbol || known.symbol, name: r.name || known.name, icon: r.icon || known.icon, usd: r.usd ?? known.usd, source: r.source, depth: r.depth, maxDepth: r.maxDepth, decimals: r.decimals };
    store.set('host:host', m); hIn.value = ''; bal = null;
    if (location.hash !== '#host=' + m) history.replaceState(null, '', '#host=' + m);
    renderHost(); refreshBalance(); paint();
  } catch (e) { if (my === checking) { st.className = 'hstat bad'; st.textContent = e.message; } }
}
$('#hGo').addEventListener('click', () => setHost(hIn.value));
hIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setHost(hIn.value); } });
hIn.addEventListener('paste', () => setTimeout(() => isAddr(hIn.value) && setHost(hIn.value), 0));
api('hosts').then(j => {
  HOSTS = j.hosts || [];
  const want = ['ETH', 'WBTC', 'PUMP', '$WIF', 'Bonk', 'TRUMP', 'SPX', 'NVDAx', 'TSLAx', 'AAPLx'];
  const pick = want.map(s => HOSTS.find(h => h.symbol === s)).filter(Boolean);
  for (const h of HOSTS) { if (pick.length >= 8) break; if (!pick.includes(h) && h.symbol) pick.push(h); }
  hOpts.innerHTML = pick.slice(0, 8).map(h => `<button type="button" data-m="${esc(h.mint)}">${h.icon ? `<img src="${esc(h.icon)}" alt="" referrerpolicy="no-referrer">` : '<i></i>'}${esc(h.symbol)}</button>`).join('');
  $$('#hOpts button').forEach(b => b.addEventListener('click', () => setHost(b.dataset.m)));
  renderHost();
}).catch(() => { hOpts.innerHTML = '<span class="hstat bad">pump.fun\'s host list didn\'t load. Paste a contract instead.</span>'; });
// what's trending on pump.fun right now, one tap away
api('pump').then(j => {
  const tr = (j.trending || []).filter(c => c.symbol).slice(0, 6); if (!tr.length) return;
  const box = $('#hTrend'); box.hidden = false;
  const pc = v => v == null ? '' : `<s class="chg ${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '+' : ''}${Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}%</s>`;
  box.innerHTML = '<span>TRENDING</span>' + tr.map(c => `<button type="button" data-m="${esc(c.mint)}">${c.icon && /^https:\/\//.test(c.icon) ? `<img src="${esc(c.icon)}" alt="" referrerpolicy="no-referrer">` : '<i></i>'}${esc(c.symbol)} ${pc(c.ch1h)}</button>`).join('');
  $$('#hTrend button').forEach(b => b.addEventListener('click', () => setHost(b.dataset.m)));
  renderHost();
}).catch(() => { });

// ---------- the form
const f = $('#lform'), name = $('#lName'), tick = $('#lTick'), desc = $('#lDesc'), xh = $('#lX'), tg = $('#lTg'), web = $('#lWeb'), file = $('#lImg'), buy = $('#lBuy'), go = $('#lGo'), flow = $('#lFlow'), st = $('#lStatus');
let img = null, metaKey = null, metaUri = null, busy = false, live = null;
const T = () => tick.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
const N = () => name.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
const BUY = () => Math.max(0, +buy.value || 0);
const HS = () => host ? (host.symbol ? '$' + host.symbol : short(host.mint, 4)) : 'the host';
async function refreshBalance() {
  const el = $('#lHold');
  if (!wallet.address || !host) { el.textContent = wallet.address ? '' : 'CONNECT TO SEE YOUR BALANCE'; return; }
  el.textContent = 'READING…';
  try { const m = host.mint; const r = await api('balance', null, `?wallet=${wallet.address}&mint=${m}`); if (!host || host.mint !== m) return; bal = r; el.textContent = `YOU HOLD ${fmtN(r.amount)} ${host.symbol || ''}`.trim(); paint(); }
  catch { el.textContent = ''; }
}
$('#lMax').addEventListener('click', () => { if (bal && bal.amount > 0) { buy.value = String(bal.amount); paint(); } else toast(wallet.address ? `Your wallet holds no ${HS()}` : 'Connect a wallet first'); });

function paint() {
  const t = T(), n = N(), d = desc.value.trim(), b = BUY();
  $('#cTick').textContent = t ? '$' + t : '$TICKER';
  $('#cName').textContent = n || 'Your coin';
  $('#cDesc').textContent = d || 'Your description shows here.';
  $('#cPic').innerHTML = img ? `<img src="${img}" alt="">` : `<span>${esc((t || '?').slice(0, 1))}</span>`;
  $('#cIn').textContent = host ? `INSIDE ${HS()}` : 'INSIDE · PICK A HOST';
  $('#cDepth').textContent = !host ? 'DEPTH —' : host.source === 'pumpCoin' ? `DEPTH D${host.depth}${host.maxDepth ? ' OF ' + host.maxDepth : ''}` : 'DEPTH D0 · ROOT';
  $('#lBuyU').textContent = host && host.symbol ? host.symbol : 'HOST';
  $('#nestL').textContent = host ? `${host.source === 'pumpCoin' ? 'SOL → … → ' : ''}${HS()} → ${t ? '$' + t : 'YOU'}` : 'SOL → THE HOST → YOU';
  $('#nestR').textContent = host && host.usd ? `${HS()} ${price(host.usd)}` : '—';
  const usd = host && host.usd && b ? ` (about $${(b * host.usd).toLocaleString('en-US', { maximumFractionDigits: b * host.usd < 10 ? 2 : 0 })})` : '';
  $('#lCost').innerHTML = b
    ? `You spend about <b>0.01 SOL</b> for the new accounts and network fees, then <b>${fmtN(b)} ${esc(HS())}</b>${usd} on your first buy, a second transaction right after the launch. host takes nothing.`
    : `You spend about <b>0.01 SOL</b> for the new accounts and network fees, and make no first buy. host takes nothing.`;
  go.innerHTML = !host ? 'Pick a host to launch <span class="ar">→</span>' : !wallet.address ? 'Connect a wallet to launch <span class="ar">→</span>' : `Launch ${t ? '$' + esc(t) : 'your coin'} inside ${esc(HS())} <span class="ar">→</span>`;
  $('#lPost').href = 'https://x.com/intent/post?text=' + encodeURIComponent(live
    ? `$${live.t} is live inside ${live.hs} on host.\n\nEvery buy of $${live.t} buys ${live.hs} first.\n\nhttps://pump.fun/coin/${live.mint}`
    : `${t ? '$' + t + ' is' : 'My coin is'} launching inside ${host ? HS() : 'another coin'} on host.\n\nEvery buy of it buys ${host ? HS() : 'the host'} first. No more PvP.`);
  store.set('host:draft', { name: name.value, tick: tick.value, desc: desc.value, x: xh.value, tg: tg.value, web: web.value, img });
  nestDirty = true;
}
const d0 = store.get('host:draft', null);
if (d0) { name.value = d0.name || ''; tick.value = d0.tick || ''; desc.value = d0.desc || ''; xh.value = d0.x || ''; tg.value = d0.tg || ''; web.value = d0.web || ''; img = d0.img || null; }
[name, tick, desc, xh, tg, web, buy].forEach(i => i.addEventListener('input', paint));

// the image, cropped square in the browser
const drop = $('#lDrop');
const take = fl => {
  if (!fl || !/^image\//.test(fl.type)) { toast('Pick an image file'); return; }
  const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => {
    const s = Math.min(im.width, im.height), cv = document.createElement('canvas'), c = cv.getContext('2d'); cv.width = cv.height = 512;
    c.fillStyle = '#0b0a0f'; c.fillRect(0, 0, 512, 512); c.imageSmoothingQuality = 'high';
    c.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 512, 512);
    img = cv.toDataURL('image/jpeg', 0.9); paint();
  }; im.onerror = () => toast("That image didn't open"); im.src = r.result; }; r.readAsDataURL(fl);
};
file.addEventListener('change', () => take(file.files[0]));
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => take(e.dataTransfer.files[0]));

// ---------- the nest: SOL → the host → your coin, with a buy running down it
let nestDirty = true;
const nest = $('#nestCv');
whileVisible(nest, t => {
  const [c, W, H] = fit(nest, 2);
  c.clearRect(0, 0, W, H);
  const pts = [[W * 0.16, H * 0.5], [W * 0.5, H * 0.5], [W * 0.84, H * 0.5]];
  const r = Math.min(H * 0.26, W * 0.12);
  c.strokeStyle = 'rgba(140,120,255,.35)'; c.lineWidth = 2; c.setLineDash([4, 6]);
  c.beginPath(); c.moveTo(pts[0][0] + r, pts[0][1]); c.lineTo(pts[1][0] - r, pts[1][1]); c.moveTo(pts[1][0] + r, pts[1][1]); c.lineTo(pts[2][0] - r, pts[2][1]); c.stroke(); c.setLineDash([]);
  // the buy: dots that go from SOL into the host, then from the host into your coin
  if (!reduced) for (let k = 0; k < 6; k++) {
    const p = ((t * 0.32 + k / 6) % 1), seg = p < 0.5 ? 0 : 1, q = (p % 0.5) / 0.5;
    const a = pts[seg], b = pts[seg + 1], x = a[0] + r + (b[0] - a[0] - 2 * r) * q, y = a[1] + Math.sin(q * Math.PI) * -H * 0.06;
    c.fillStyle = seg ? C.vi2 : C.sol; c.globalAlpha = Math.sin(q * Math.PI); c.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6); c.globalAlpha = 1;
  }
  const hl = host ? (host.symbol || '?').replace(/^\$/, '').slice(0, 5).toUpperCase() : '?';
  const yl = (T() || 'YOU').slice(0, 5);
  pixCoin(c, pts[0][0], pts[0][1], r * 0.82, 'SOL', 'sol');
  pixCoin(c, pts[1][0], pts[1][1], r * (1 + Math.sin(t * 2) * 0.015), hl, 'vi');
  pixCoin(c, pts[2][0], pts[2][1], r * 0.9, yl, 'gold');
  c.font = `600 ${Math.max(10, H * 0.045)}px JB, monospace`; c.textAlign = 'center'; c.fillStyle = C.dim;
  c.fillText('YOU PAY', pts[0][0], pts[0][1] + r + 22); c.fillText('THE HOST', pts[1][0], pts[1][1] + r + 22); c.fillText('YOUR COIN', pts[2][0], pts[2][1] + r + 22);
});

// ---------- the launch
const say = (html, err) => { st.className = 'lstatus' + (err ? ' err' : ''); st.innerHTML = html; st.hidden = false; };
const step = (k, state, note) => { const li = flow.querySelector(`[data-k="${k}"]`); if (!li) return; li.className = state; const n = li.querySelector('small'); if (n) n.innerHTML = note || ''; };
const lock = on => { busy = on; [name, tick, desc, xh, tg, web, file, buy, hIn].forEach(i => (i.disabled = on)); go.disabled = on; f.classList.toggle('busy', on); };
async function land(sig, b64, lastValid) {
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < 100000) {
    await sleep(1200); n++;
    let s = null; try { s = await api('status', null, `?sig=${sig}&h=${lastValid}`); } catch { continue; }
    if (s.state === 'confirmed') return s.slot;
    if (s.state === 'failed') throw new Error('The launch landed but failed on chain, so no coin was made. Solana kept only the network fee. ' + esc(s.err || ''));
    if (s.state === 'expired') throw new Error('Solana did not take the launch in time, so nothing happened and nothing was spent. Launch again.');
    if (n % 3 === 0) api('send', { tx: b64 }).catch(() => { });
  }
  throw new Error(`No answer from Solana yet. It may still land: check <a href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener">the transaction ↗</a> before you try again.`);
}
// the first buy: its own transaction, right after the coin is live (create and buy together don't fit in one)
async function firstBuy(mint, hm, b, hs, t) {
  const li = flow.querySelector('[data-k="buy"]'); li.hidden = false;
  try {
    step('buy', 'run', `Building a buy of ${fmtN(b)} ${esc(hs)}…`);
    let q = null;
    for (let i = 0; i < 6 && !q; i++) { try { q = await api('buy', { wallet: wallet.address, mint, host: hm, amount: b }); } catch (e) { if (e.code !== 'pending' || i === 5) throw e; await sleep(2000); } }
    step('buy', 'run', 'Approve the buy in your wallet.');
    let signed;
    try { signed = await wallet.signTx(fromB64(q.tx)); }
    catch (e) { throw new Error(/reject|cancel|denied|declin/i.test(e && e.message || '') ? 'You cancelled the buy in your wallet.' : esc((e && e.message) || 'The wallet did not sign.')); }
    const b64 = toB64(signed), { sig } = await api('send', { tx: b64 });
    step('buy', 'run', 'Waiting for Solana…');
    await land(sig, b64, q.lastValid);
    step('buy', 'ok', `${fmtN(q.tokens || 0)} $${esc(t)} for ${fmtN(b)} ${esc(hs)} · <a href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener">${esc(short(sig, 6))} ↗</a>`);
    return { ok: true, sig };
  } catch (e) {
    step('buy', 'bad', `${(e && e.message) || esc(String(e))} Your coin is live: you can buy it on pump.fun.`);
    return { ok: false };
  }
}
async function launch() {
  if (busy) return;
  const t = T(), n = N(), b = BUY();
  const miss = !host ? 'Pick a host first.' : !n ? 'Give your coin a name.' : !t ? 'Give your coin a ticker.' : !img ? 'Add an image.' : null;
  if (miss) { say(esc(miss), true); return; }
  if (!wallet.address) { wallet.open(); return; }
  if (b && bal && b > bal.amount) { say(`Your wallet holds ${fmtN(bal.amount)} ${esc(HS())}, less than the ${fmtN(b)} you want to buy with.`, true); return; }
  lock(true); flow.hidden = false; st.hidden = true;
  flow.querySelectorAll('li').forEach(li => { li.className = ''; const s = li.querySelector('small'); if (s) s.textContent = ''; });
  flow.querySelector('[data-k="buy"]').hidden = !(b > 0);
  flow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const hs = HS(), hm = host.mint;
  try {
    step('meta', 'run', 'Storing your image and details…');
    const key = JSON.stringify([n, t, desc.value.trim(), xh.value.trim(), tg.value.trim(), web.value.trim(), img.length, img.slice(-64)]);
    if (key !== metaKey || !metaUri) { const m = await api('meta', { name: n, symbol: t, desc: desc.value.trim(), image: img, x: xh.value.trim(), telegram: tg.value.trim(), website: web.value.trim() }); metaUri = m.uri; metaKey = key; }
    step('meta', 'ok', `<a href="${esc(metaUri)}" target="_blank" rel="noopener">${esc(short(metaUri.replace(/^https:\/\//, ''), 14))} ↗</a>`);

    step('build', 'run', 'Building the launch and trying it against Solana…');
    const seed = ed.utils.randomPrivateKey(), pub = await ed.getPublicKeyAsync(seed), mint = b58(pub);
    const r = await api('build', { wallet: wallet.address, mint, host: hm, name: n, symbol: t, uri: metaUri, buyHost: 0 });
    step('build', 'ok', `${r.cost != null ? `About ${r.cost.toFixed(4)} SOL for the new accounts and fees` : 'Tried against Solana: it works'} · your coin sits at D${r.depth}`);

    step('sign', 'run', 'Approve the launch in your wallet.');
    let signed;
    try { signed = await wallet.signTx(fromB64(r.tx)); }
    catch (e) { throw new Error(/reject|cancel|denied|declin/i.test(e && e.message || '') ? 'You cancelled in your wallet. Nothing was sent.' : esc((e && e.message) || 'The wallet did not sign.')); }
    const full = await signAsMint(signed, pub, seed), b64 = toB64(full);
    step('sign', 'ok');

    step('send', 'run');
    const { sig } = await api('send', { tx: b64 });
    step('send', 'ok', `<a href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener">${esc(short(sig, 6))} ↗</a>`);
    const mine = store.get('host:mine', []); mine.unshift({ mint: r.mint, host: hm, sig, t, n, at: Date.now() }); store.set('host:mine', mine.slice(0, 40));

    step('land', 'run', 'Waiting for Solana…');
    const slot = await land(sig, b64, r.lastValid);
    step('land', 'ok', `Block ${slot.toLocaleString('en-US')}`);
    live = { t, n, mint: r.mint, sig, hs, buy: null };
    if (b > 0) live.buy = await firstBuy(r.mint, hm, b, hs, t);
    showLive(); metaUri = null; metaKey = null;
  } catch (e) {
    const li = flow.querySelector('li.run'); if (li) li.className = 'bad';
    say((e && e.message) || esc(String(e)), true);
  }
  lock(false); paint();
}
function showLive() {
  const box = $('#lDone');
  box.innerHTML = `<b>$${esc(live.t)} is live inside ${esc(live.hs)}.</b><p>Every buy of $${esc(live.t)} buys ${esc(live.hs)} first. It's on pump.fun now${live.buy ? (live.buy.ok ? ', with your first buy in.' : '. Your first buy didn\'t go through, so buy it there.') : '.'}</p>
    <button class="ca" type="button" id="lMint"><span>COIN</span><code>${esc(live.mint)}</code><em>COPY</em></button>
    <div class="prow"><a class="btn g" href="https://pump.fun/coin/${esc(live.mint)}" target="_blank" rel="noopener">Open on pump.fun ↗</a><a class="btn o" href="https://solscan.io/tx/${esc(live.sig)}" target="_blank" rel="noopener">Solscan ↗</a><button class="btn o" type="button" id="lAgain">Launch another</button></div>`;
  box.hidden = false;
  $('#lMint').onclick = () => copy(live.mint, 'Coin address copied');
  $('#lAgain').onclick = () => { live = null; box.hidden = true; flow.hidden = true; st.hidden = true; [name, tick, desc, xh, tg, web, buy].forEach(i => (i.value = '')); img = null; paint(); scrollTo({ top: 0, behavior: 'smooth' }); };
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  loadGuests(true);
}
f.addEventListener('submit', e => { e.preventDefault(); launch(); });
$('#lReset').addEventListener('click', () => { if (busy) return; [name, tick, desc, xh, tg, web, buy].forEach(i => (i.value = '')); img = null; metaUri = null; st.hidden = true; paint(); });

// ---------- guests
let gLast = 0;
async function loadGuests(force) {
  if (!force && Date.now() - gLast < 10000) return; gLast = Date.now();
  const box = $('#guestList');
  try {
    const j = await api('list');
    $('#gCount').textContent = j.count ? `${j.count} so far · read from Solana` : 'Read from Solana';
    if (!j.coins.length) { box.innerHTML = `<div class="gempty"><img src="/img/sp-gold.webp" alt=""><b>No guests yet.</b><span>The first coin launched inside a host through host shows up here, with the coin it lives in.</span><a class="btn g" href="#launch">Launch the first one <span class="ar">→</span></a></div>`; return; }
    box.innerHTML = j.coins.map(c => `<a class="grow" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener"><span class="ic">${icon(c.image, c.symbol)}</span><span class="nm"><b>${esc(c.symbol ? '$' + c.symbol : short(c.mint, 4))}</b><i>${esc(c.name || '')}</i></span><span class="in">inside <b>${esc(c.hostSymbol ? '$' + c.hostSymbol : short(c.host, 4))}</b></span><span class="bar"><i style="width:${Math.max(2, c.curve || 0)}%"></i><em>${c.complete ? 'GRADUATED' : c.curve != null ? Math.round(c.curve) + '% TO GRADUATE' : 'ON THE CURVE'}</em></span><span class="age">${ago(c.time)}</span></a>`).join('');
  } catch (e) { box.innerHTML = `<div class="gempty"><b>The chain didn't answer.</b><span>${esc(e.message || '')}</span></div>`; gLast = 0; }
}

// ---------- check a coin
const ckForm = $('#ckForm'), ckIn = $('#ckIn'), ckOut = $('#ckOut');
ckForm.addEventListener('submit', async e => {
  e.preventDefault(); const m = ckIn.value.trim();
  if (!isAddr(m)) { ckOut.innerHTML = '<div class="ckres"><span class="ic">?</span><div><b>That isn\'t a Solana address.</b><span>Paste a coin\'s contract address.</span></div></div>'; return; }
  const btn = ckForm.querySelector('button'), label = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Asking pump.fun…';
  try {
    const r = await api('check', null, '?mint=' + encodeURIComponent(m));
    const nm = r.symbol ? '$' + r.symbol : short(m, 5);
    ckOut.innerHTML = r.can
      ? `<div class="ckres"><span class="ic">${icon(r.icon, r.symbol)}</span><div><b>${esc(nm)} can host.</b><span>${esc(r.name || '')}</span></div><span class="verdict y">CAN HOST</span>
         <div class="facts"><div><small>From</small><strong>${r.source === 'pumpCoin' ? 'a pump coin' : r.source === 'quoteControl' ? "pump.fun's list" : 'pump.fun'}</strong></div><div><small>Your coin's depth</small><strong>${r.source === 'pumpCoin' ? `D${r.depth} of ${r.maxDepth || 5}` : 'D0 · a root coin'}</strong></div><div><small>Price</small><strong>${price(r.usd)}</strong></div><div><small>Contract</small><strong>${esc(short(m, 6))}</strong></div></div>
         <div class="act"><a class="btn g" href="#host=${esc(m)}">Launch inside ${esc(nm)} <span class="ar">→</span></a><a class="btn o" href="https://pump.fun/coin/${esc(m)}" target="_blank" rel="noopener">${esc(nm)} on pump.fun ↗</a></div></div>`
      : `<div class="ckres"><span class="ic">✕</span><div><b>${esc(nm)} can't host.</b><span>${esc(r.error || '')}</span></div><span class="verdict n">CAN'T HOST</span></div>`;
  } catch (x) { ckOut.innerHTML = `<div class="ckres"><span class="ic">!</span><div><b>The check didn't finish.</b><span>${esc(x.message || '')}</span></div></div>`; }
  btn.disabled = false; btn.innerHTML = label;
});

// start: the host from the link, or the one used last
const h0 = /^#host=([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(location.hash);
if (!h0) { const last = store.get('host:host', null); if (last && isAddr(last)) setHost(last); }
// the wallet button (wired last: a wallet can answer the moment it is asked)
wallet.on(s => {
  const b = $('#wNav'); b.classList.toggle('on', !!s.address); b.textContent = s.address ? short(s.address, 4) : 'Connect';
  bal = null; refreshBalance(); paint();
});
$('#wNav').addEventListener('click', () => wallet.open());

paint(); route();
