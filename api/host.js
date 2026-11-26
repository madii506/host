// host API: launch inside any coin, on pump.fun's own program. No keys, no database.
//   GET  /api/config                 the live limits (how deep coins can go) and the tag Kairo-style launches carry
//   GET  /api/hosts                  every asset pump.fun lets a coin be priced in, with names, icons and prices
//   GET  /api/check?mint=            can this coin host? (any pump coin, or a listed asset)
//   GET  /api/balance?wallet=&mint=  how much of the host a wallet holds, for the first buy
//   POST /api/meta                   upload the coin's image and metadata to IPFS through pump.fun
//   POST /api/build                  one transaction: create the coin priced in the host, plus an optional first buy in the host
//   POST /api/send   GET /api/status the signed launch, broadcast and watched
//   GET  /api/list                   every coin launched through host, read from the chain
'use strict';
const { Connection, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } = require('@solana/web3.js');
const BN = require('bn.js');
const P = require('@pump-fun/pump-sdk');

const RPCS = [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
async function rpcFetch(url, opts) {
  let last = null;
  for (let round = 0; round < 2; round++) {
    for (const u of RPCS) {
      try { const r = await fetch(u, { ...opts, signal: AbortSignal.timeout(12000) }); if (r.status === 429 || r.status === 401 || r.status === 403 || r.status >= 500) { last = r; continue; } return r; }
      catch (e) { last = e; }
    }
    await new Promise(r => setTimeout(r, 600));
  }
  if (last instanceof Error) throw last; return last;
}
const conn = new Connection(RPCS[0], { commitment: 'confirmed', fetch: rpcFetch, disableRetryOnRateLimit: true });
const sdk = () => new P.OnlinePumpSdk(conn);
async function rawRpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`rpc ${r.status}`); return r.json();
}

const PUMP58 = P.PUMP_PROGRAM_ID.toBase58();
// every host launch sends 0 SOL here inside its own transaction, with a memo naming the coin and its host
const TAG = new PublicKey(process.env.HOST_TAG || 'EuU8Xw9aYnHUAeDkv1CshvmnSXLpPd2vrao9gsXhWXFv');
const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const TAG58 = TAG.toBase58(), SOL58 = 'So11111111111111111111111111111111111111112';
const CU_PRICE = +process.env.HOST_CU_PRICE || 400000;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of bytes) { if (x === 0) s = '1' + s; else break; } return s; }
const isAddr = s => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const isSig = s => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(s);
const out = (res, code, b, cache) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', cache || 'no-store'); res.end(JSON.stringify(b)); };
const body = req => new Promise(ok => {
  if (req.body) { try { return ok(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); } catch { return ok({}); } }
  let d = ''; req.on('data', c => { d += c; if (d.length > 3e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } });
});
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const pk = (s, what) => { try { return new PublicKey(String(s)); } catch { throw new Error(what || 'That is not a Solana address.'); } };
function link(s, re, what) {
  s = clean(s, 200); if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  s = s.replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\/[^\s<>"']+$/.test(s) || (re && !re.test(s))) throw new Error(`The ${what} link doesn't look right.`);
  return s;
}

// ---------- names, icons and prices, from Jupiter's token list
async function jup(mints) {
  const outm = {};
  for (let i = 0; i < mints.length; i += 100) {
    try {
      const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + mints.slice(i, i + 100).join(','), { signal: AbortSignal.timeout(9000) });
      for (const t of await r.json()) outm[t.id] = t;
    } catch { /* names are optional */ }
  }
  return outm;
}
const cat = t => {
  const n = `${t.name || ''} ${t.symbol || ''}`;
  if (/xStock|Backpack Securities|PreStock|Pre-IPO|Securities|\bETF\b|Index/i.test(n)) return 'stock';
  if (/Portal|Wormhole|Wrapped|Bridged|Staked|Coinbase|USD|\bSUI\b|\bHYPE\b|\bPUMP\b|\bORE\b|\bNEAR\b|\bJUP\b|\bW\b|Ether|Bitcoin|BTC|ETH|XRP/i.test(n)) return 'crypto';
  return 'meme';
};

// ---------- the host list: pump.fun's QuoteControl, read live
let hostsCache = null, globalCache = null;
async function global() { if (globalCache && Date.now() - globalCache.t < 300000) return globalCache.v; const v = await sdk().fetchGlobal(); globalCache = { t: Date.now(), v }; return v; }
async function hosts() {
  if (hostsCache && Date.now() - hostsCache.t < 300000) return hostsCache.v;
  const qc = await sdk().fetchQuoteControl();
  const mints = ((qc && qc.mints) || []).map(m => (m.mint || m).toBase58());
  const [meta, g] = await Promise.all([jup([...mints, SOL58]), global().catch(() => null)]);
  const list = mints.map(m => { const t = meta[m] || {}; return { mint: m, symbol: t.symbol || null, name: t.name || null, icon: t.icon || null, usd: t.usdPrice ?? null, liq: Math.round(t.liquidity || 0), cat: cat(t) }; })
    .sort((a, b) => (b.liq || 0) - (a.liq || 0));
  const v = { ok: true, count: list.length, maxDepth: g ? Number(g.maxCurveDepth || 0) : null, solUsd: (meta[SOL58] && meta[SOL58].usdPrice) || null, hosts: list };
  hostsCache = { t: Date.now(), v }; return v;
}

// ---------- can this coin host?
const WHY = {
  UnsupportedQuoteMintError: "That coin can't host: it isn't a pump coin and isn't on pump.fun's list of hosts.",
  CurveDepthExceededError: 'That coin is already as deep as pump.fun allows, so it can\'t host another layer.',
  QuoteBondingCurveNotEligibleError: "That pump coin can't host right now (pump.fun doesn't allow it as a quote).",
  QuoteCurveAwaitingMigrationError: 'That coin is moving to PumpSwap right now. Try again in a few minutes.',
  QuoteReservesOutOfRangeError: "That coin's price is out of the range pump.fun allows for a host right now.",
  QuotePoolNotFoundError: "That coin graduated but its pool wasn't found.",
};
const why = e => WHY[(e && (e.name || (e.constructor && e.constructor.name))) || ''] || (e && e.message) || String(e);
async function check(mintS) {
  const mint = pk(mintS);
  let r; try { r = await sdk().resolveQuoteMint(mint); } catch (e) { return { ok: true, can: false, mint: mintS, error: why(e) }; }
  const g = await global().catch(() => null);
  const meta = (await jup([mintS]))[mintS] || {};
  return { ok: true, can: true, mint: mintS, source: r.source, decimals: r.decimals, program: r.quoteTokenProgram.toBase58(), depth: r.pumpQuote ? r.pumpQuote.depth : 0, maxDepth: g ? Number(g.maxCurveDepth || 0) : null, symbol: meta.symbol || null, name: meta.name || null, icon: meta.icon || null, usd: meta.usdPrice ?? null };
}
async function balance(walletS, mintS) {
  const wallet = pk(walletS), mint = pk(mintS);
  const r = await conn.getParsedTokenAccountsByOwner(wallet, { mint }).catch(() => null);
  let ui = 0; for (const a of (r && r.value) || []) ui += Number(a.account.data.parsed.info.tokenAmount.uiAmountString || 0);
  const sol = await conn.getBalance(wallet).catch(() => null);
  return { ok: true, amount: ui, sol: sol == null ? null : sol / 1e9 };
}

// ---------- the coin's image and metadata, to IPFS through pump.fun's own upload
async function meta(req) {
  const b = await body(req);
  const name = clean(b.name, 32).replace(/[<>]/g, ''), symbol = clean(b.symbol, 10).toUpperCase().replace(/^\$/, ''), desc = clean(b.desc, 500);
  if (!name) throw new Error('Give your coin a name.');
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) throw new Error('The ticker can use letters and numbers, up to 10.');
  const m = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ''));
  if (!m) throw new Error('Add an image (png, jpg, webp or gif).');
  const buf = Buffer.from(m[3], 'base64'); if (buf.length > 1.5e6) throw new Error('That image is too big.');
  const x = link(b.x, /^https:\/\/(www\.)?(x|twitter)\.com\//i, 'X'), tg = link(b.telegram, /^https:\/\/(www\.)?t\.me\//i, 'Telegram'), web = link(b.website, null, 'website');
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: m[1] }), 'image.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
  fd.append('name', name); fd.append('symbol', symbol); fd.append('description', desc || `${name} ($${symbol}), launched inside another coin on host.`);
  fd.append('twitter', x); fd.append('telegram', tg); fd.append('website', web); fd.append('showName', 'true');
  const r = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: fd, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`The image upload didn't go through (${r.status}). Try again in a moment.`);
  const j = await r.json();
  if (!j || !j.metadataUri) throw new Error('The image upload returned nothing. Try again.');
  return { ok: true, uri: j.metadataUri, image: (j.metadata && j.metadata.image) || null, name, symbol };
}

// ---------- build: create the coin priced in the host, and the creator's first buy, in one transaction
const toRaw = (ui, dec) => { const [i, f = ''] = String(ui).split('.'); return new BN((i || '0') + (f + '0'.repeat(dec)).slice(0, dec)); };
async function build(req) {
  const b = await body(req);
  const wallet = pk(b.wallet, 'Connect a wallet first.'), mint = pk(b.mint, 'The new coin address is missing. Reload and try again.'), host = pk(b.host, 'Pick a host first.');
  if (!PublicKey.isOnCurve(mint.toBytes())) throw new Error('The new coin address is not a key. Reload and try again.');
  const name = clean(b.name, 32).replace(/[<>]/g, ''), symbol = clean(b.symbol, 10).toUpperCase().replace(/^\$/, '');
  if (!name || !/^[A-Z0-9]{1,10}$/.test(symbol)) throw new Error('Give your coin a name and a ticker.');
  const uri = clean(b.uri, 200); if (!/^https:\/\/\S+$/.test(uri)) throw new Error('The metadata link is missing. Upload the image again.');
  const dry = !!b.dry;
  const s = sdk();
  let rq; try { rq = await s.resolveQuoteMint(host); } catch (e) { throw new Error(why(e)); }
  const g = await global();
  const buyUi = Math.max(0, Number(b.buyHost) || 0);
  let ixs, tokens = null;
  const pumpQuote = rq.pumpQuote ? rq.pumpQuote.accounts : undefined;
  if (buyUi > 0) {
    const quoteAmount = toRaw(buyUi, rq.decimals);
    if (!dry) {
      const bal = await balance(wallet.toBase58(), host.toBase58());
      if (bal.amount < buyUi) throw new Error(`Your wallet holds ${bal.amount} of the host, less than the ${buyUi} you want to buy with.`);
    }
    const [feeConfig, qc] = await Promise.all([s.fetchFeeConfig().catch(() => null), rq.source === 'quoteControl' ? s.fetchQuoteControl().catch(() => null) : null]);
    const amount = P.getBuyTokenAmountFromSolAmount({ global: g, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteAmount, quoteMint: rq.mint, quoteControl: qc, pumpQuote: rq.pumpQuote ? rq.pumpQuote.curve : undefined });
    tokens = Number(amount.toString()) / 1e6;
    ixs = await P.PUMP_SDK.createV2AndBuyV2Instructions({ global: g, mint, name, symbol, uri, creator: wallet, user: wallet, amount, quoteAmount, mayhemMode: false, quoteMint: rq.mint, quoteTokenProgram: rq.quoteTokenProgram, pumpQuote, slippage: 3 });
  } else {
    ixs = [await P.PUMP_SDK.createV2Instruction({ mint, name, symbol, uri, creator: wallet, user: wallet, mayhemMode: false, quoteMint: rq.mint, quoteTokenProgram: rq.quoteTokenProgram, pumpQuote })];
  }
  const CB = ComputeBudgetProgram.programId; ixs = ixs.filter(ix => !ix.programId.equals(CB));
  const tag = [new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(`host:${mint.toBase58()}:${host.toBase58()}`) }), SystemProgram.transfer({ fromPubkey: wallet, toPubkey: TAG, lamports: 0 })];
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const compile = (units, memo) => new VersionedTransaction(new TransactionMessage({ payerKey: wallet, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE }), ...ixs, ...(memo ? tag : tag.slice(1))] }).compileToV0Message());
  let memo = true, tx = compile(700000, true);
  if (tx.serialize().length > 1232) { memo = false; tx = compile(700000, false); }
  if (tx.serialize().length > 1232) throw new Error('This launch is too big for one transaction. Try a shorter name.');
  const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).map(k => k.toBase58());
  if (signers.length !== 2 || signers[0] !== wallet.toBase58() || signers[1] !== mint.toBase58()) throw new Error('Unexpected signers: ' + signers.join(', '));
  const bal = await conn.getBalance(wallet).catch(() => null);
  const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed', accounts: { encoding: 'base64', addresses: [wallet.toBase58()] } });
  const logs = (sim.value.logs || []).slice(-14);
  if (sim.value.err) {
    const all = (sim.value.logs || []).join('\n') + JSON.stringify(sim.value.err);
    if (/insufficient lamports|insufficient funds|InsufficientFunds/i.test(all)) throw Object.assign(new Error('Your wallet needs a little more SOL for this launch (about 0.03 SOL for the new accounts and fees).'), { logs });
    throw Object.assign(new Error('The launch failed when we tried it against Solana, so nothing was sent. ' + (logs.filter(l => /error|failed/i.test(l)).slice(-1)[0] || JSON.stringify(sim.value.err)).slice(0, 220)), { logs });
  }
  const used = sim.value.unitsConsumed || 300000, units = Math.min(1400000, Math.ceil(used * 1.15) + 20000);
  tx = compile(units, memo);
  const post = sim.value.accounts && sim.value.accounts[0] ? sim.value.accounts[0].lamports : null;
  return { ok: true, tx: Buffer.from(tx.serialize()).toString('base64'), mint: mint.toBase58(), host: host.toBase58(), source: rq.source, depth: rq.pumpQuote ? rq.pumpQuote.depth : 0, lastValid: lastValidBlockHeight, units, bytes: tx.serialize().length, memo, tokens, cost: bal != null && post != null ? Math.max(0, (bal - post) / 1e9) : null, ...(dry && { dry: true, logs, used }) };
}

// ---------- send: only host launches, to every RPC at once
async function send(req) {
  const b = await body(req); const raw = Buffer.from(String(b.tx || ''), 'base64');
  if (raw.length < 200 || raw.length > 1232) throw new Error('That is not a host launch.');
  let tx; try { tx = VersionedTransaction.deserialize(raw); } catch { throw new Error('That is not a host launch.'); }
  const keys = tx.message.staticAccountKeys.map(k => k.toBase58());
  if (!keys.includes(PUMP58) || !keys.includes(TAG58)) throw new Error('host only sends its own launches.');
  if (tx.signatures.some(s => s.every(x => x === 0))) throw new Error('The launch is missing a signature. Sign it in your wallet and try again.');
  const sig = b58(tx.signatures[0]), b64 = raw.toString('base64');
  const rs = await Promise.allSettled(RPCS.map(u => rawRpc(u, 'sendTransaction', [b64, { encoding: 'base64', skipPreflight: true, maxRetries: 0 }])));
  if (!rs.some(r => r.status === 'fulfilled' && r.value && !r.value.error)) {
    const w = rs.map(r => r.status === 'fulfilled' ? r.value && r.value.error && r.value.error.message : r.reason && r.reason.message).filter(Boolean)[0] || 'no answer';
    if (/blockhash not found/i.test(w)) throw Object.assign(new Error('This launch waited too long to be signed. Build it again.'), { code: 'expired' });
    throw new Error('Solana did not take the launch: ' + w.slice(0, 160));
  }
  return { ok: true, sig };
}
async function status(q) {
  const sig = q.get('sig'); if (!isSig(sig)) throw new Error('bad signature');
  const h = +q.get('h') || 0;
  const r = await conn.getSignatureStatuses([sig], { searchTransactionHistory: false }); const s = r && r.value && r.value[0];
  if (s) { if (s.err) return { ok: true, state: 'failed', slot: s.slot, err: JSON.stringify(s.err).slice(0, 200) }; if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') return { ok: true, state: 'confirmed', slot: s.slot }; return { ok: true, state: 'pending', slot: s.slot }; }
  if (h) { const now = await conn.getBlockHeight('confirmed').catch(() => 0); if (now && now > h) return { ok: true, state: 'expired' }; }
  return { ok: true, state: 'pending' };
}

// ---------- the guests: every coin launched through host
let listCache = null;
async function list() {
  if (listCache && Date.now() - listCache.t < 20000) return listCache.v;
  const sigs = (await conn.getSignaturesForAddress(TAG, { limit: 200 })).filter(s => !s.err);
  const coins = [];
  for (let i = 0; i < sigs.length; i += 50) {
    const txs = await conn.getParsedTransactions(sigs.slice(i, i + 50).map(s => s.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => []);
    txs.forEach((t, k) => {
      if (!t || !t.meta || t.meta.err) return;
      const keys = t.transaction.message.accountKeys.map(x => x.pubkey.toBase58()); if (!keys.includes(PUMP58)) return;
      const m = ((t.meta.logMessages) || []).map(l => /"host:([1-9A-HJ-NP-Za-km-z]{32,44}):([1-9A-HJ-NP-Za-km-z]{32,44})"/.exec(l)).find(Boolean);
      if (m) coins.push({ mint: m[1], host: m[2], sig: sigs[i + k].signature, time: t.blockTime || null, creator: keys[0] });
    });
  }
  const top = coins.slice(0, 60);
  if (top.length) {
    const [meta, g, curves] = await Promise.all([jup([...new Set(top.flatMap(c => [c.mint, c.host]))]), global().catch(() => null), conn.getMultipleAccountsInfo(top.map(c => P.bondingCurvePda(c.mint))).catch(() => [])]);
    top.forEach((c, i) => {
      const t = meta[c.mint] || {}, h = meta[c.host] || {};
      Object.assign(c, { symbol: t.symbol || null, name: t.name || null, image: t.icon || null, hostSymbol: h.symbol || null, hostIcon: h.icon || null });
      try { const bc = curves[i] && P.PUMP_SDK.decodeBondingCurve(curves[i]); if (bc && g) { const init = Number(g.initialRealTokenReserves.toString()), real = Number(bc.realTokenReserves.toString()); c.curve = bc.complete ? 100 : Math.max(0, Math.min(100, (1 - real / init) * 100)); c.complete = !!bc.complete; } } catch { }
    });
  }
  const v = { ok: true, tag: TAG58, count: coins.length, coins: top };
  listCache = { t: Date.now(), v }; return v;
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x'), q = u.searchParams, p = (q.get('__p') || '').replace(/\/+$/, '');
  try {
    if (p === 'config') { const g = await global().catch(() => null); return out(res, 200, { ok: true, tag: TAG58, maxDepth: g ? Number(g.maxCurveDepth || 0) : null }, 's-maxage=300'); }
    if (p === 'hosts') return out(res, 200, await hosts(), 's-maxage=120, stale-while-revalidate=600');
    if (p === 'check') { const m = (q.get('mint') || '').trim(); if (!isAddr(m)) return out(res, 400, { ok: false, error: "That isn't a Solana address." }); return out(res, 200, await check(m), 's-maxage=30'); }
    if (p === 'balance') return out(res, 200, await balance(q.get('wallet'), q.get('mint')));
    if (p === 'list') return out(res, 200, await list(), 's-maxage=15, stale-while-revalidate=60');
    if (p === 'status') return out(res, 200, await status(q));
    if (req.method === 'POST' && p === 'meta') return out(res, 200, await meta(req));
    if (req.method === 'POST' && p === 'build') return out(res, 200, await build(req));
    if (req.method === 'POST' && p === 'send') return out(res, 200, await send(req));
    return out(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return out(res, 400, { ok: false, code: e.code || 'error', error: e.message || String(e), ...(e.logs && { logs: e.logs }) });
  }
};
