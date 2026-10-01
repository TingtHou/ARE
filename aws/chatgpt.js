// ChatGPT on the study site, on each person's own ChatGPT plan (OpenAI "Sign in with ChatGPT": plan usage for
// open-source apps, self-hosted route). Each person signs in once on their own computer with
// tools/chatgpt-signin.mjs; it completes the sign-in there and hands the credentials to this function, which
// stores them encrypted, refreshes them, and streams answers to the website.
//   POST /pair        (site sign-in)  one-time code for the sign-in script
//   GET  /pair-info   (pairing code)  this host's ID, for the script
//   POST /import      (pairing code)  the script delivers the credentials
//   GET  /status      (site sign-in)  connection state and models
//   POST /model       (site sign-in)  choose a model
//   POST /ask         (site sign-in)  streamed answer, one JSON object per line
//   POST /disconnect  (site sign-in)  revoke and forget the credentials
'use strict';
const crypto = require('crypto');

const TABLE = process.env.TABLE, COG_CLIENT = process.env.CLIENT_ID, POOL_ID = process.env.POOL_ID, REGION = process.env.AWS_REGION;
const KEY_PARAM = process.env.KEY_PARAM || '/are-study-system/chatgpt-token-key';
const ISSUER = (process.env.OPENAI_ISSUER || 'https://auth.openai.com').replace(/\/+$/, '');
const OAPI = (process.env.OPENAI_API || 'https://api.openai.com/v1').replace(/\/+$/, '');
const RESOURCE = 'https://api.openai.com/v1';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const PAIR_LIFE = 900, MODELS_LIFE = 12 * 3600 * 1000;

/* ---------- storage (replaced by fakes in tests) ---------- */
let deps = null;
function D() {
  if (deps) return deps;
  const ddb = require('@aws-sdk/client-dynamodb'), ssmm = require('@aws-sdk/client-ssm');
  const db = new ddb.DynamoDBClient({}), ssm = new ssmm.SSMClient({});
  const K = k => ({ userId: { S: k } });
  let keyP = null;
  deps = {
    async get(k) {
      const r = await db.send(new ddb.GetItemCommand({ TableName: TABLE, Key: K(k), ConsistentRead: true }));
      const i = r.Item; return i ? { data: i.data && i.data.S, ver: i.ver ? Number(i.ver.N) : 0, lock: i.lockUntil ? Number(i.lockUntil.N) : 0 } : null;
    },
    // o: { ttl, ver, lock, ifVer: number (must match) | null (must not exist), lockFree: now (no lock held) }
    async put(k, data, o) {
      o = o || {};
      const item = Object.assign(K(k), { data: { S: data } });
      if (o.ttl) item.ttl = { N: String(o.ttl) };
      if (o.ver != null) item.ver = { N: String(o.ver) };
      if (o.lock) item.lockUntil = { N: String(o.lock) };
      const c = [], v = {};
      if (o.ifVer === null) c.push('attribute_not_exists(userId)');
      else if (o.ifVer != null) { c.push('ver = :v'); v[':v'] = { N: String(o.ifVer) }; }
      if (o.lockFree != null) { c.push('(attribute_not_exists(lockUntil) OR lockUntil < :n)'); v[':n'] = { N: String(o.lockFree) }; }
      try {
        await db.send(new ddb.PutItemCommand({ TableName: TABLE, Item: item, ConditionExpression: c.length ? c.join(' AND ') : undefined, ExpressionAttributeValues: c.length && Object.keys(v).length ? v : undefined }));
        return true;
      } catch (e) { if (e.name === 'ConditionalCheckFailedException') return false; throw e; }
    },
    async take(k) { const r = await db.send(new ddb.DeleteItemCommand({ TableName: TABLE, Key: K(k), ReturnValues: 'ALL_OLD' })); return r.Attributes && r.Attributes.data ? { data: r.Attributes.data.S } : null; },
    async del(k) { await db.send(new ddb.DeleteItemCommand({ TableName: TABLE, Key: K(k) })); },
    // the encryption key for stored credentials: created on first use as a SecureString parameter
    key() {
      if (!keyP) keyP = (async () => {
        const read = async () => Buffer.from((await ssm.send(new ssmm.GetParameterCommand({ Name: KEY_PARAM, WithDecryption: true }))).Parameter.Value, 'base64');
        try { return await read(); }
        catch (e) {
          if (e.name !== 'ParameterNotFound') throw e;
          try { await ssm.send(new ssmm.PutParameterCommand({ Name: KEY_PARAM, Type: 'SecureString', Value: crypto.randomBytes(32).toString('base64'), Overwrite: false, Description: 'Encrypts ChatGPT credentials for the ARE Study System. Deleting it disconnects everyone.' })); }
          catch (e2) { if (e2.name !== 'ParameterAlreadyExists') throw e2; }
          return await read();
        }
      })().catch(e => { keyP = null; throw e; });
      return keyP;
    }
  };
  return deps;
}

/* ---------- helpers ---------- */
const rnd = n => crypto.randomBytes(n || 32).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('base64url');
const nowS = () => Math.floor(Date.now() / 1000);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function seal(k, obj) {
  const key = await D().key(), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(k));
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
async function open(k, s) {
  const key = await D().key(), b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAAD(Buffer.from(k)); d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
}
const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
const JWKS = {};
async function jwks(url, force) {
  const c = JWKS[url];
  if (c && !force && Date.now() - c.at < 3600e3) return c.keys;
  const r = await fetch(url); if (!r.ok) throw new Error('keys ' + r.status);
  const keys = (await r.json()).keys || []; JWKS[url] = { at: Date.now(), keys }; return keys;
}
// verify a signed JWT (RS256 or ES256) and its standard claims
async function verifyJwt(tok, o) {
  const p = String(tok || '').split('.'); if (p.length !== 3) throw new Error('not a JWT');
  const h = b64json(p[0]), body = b64json(p[1]);
  if (!['RS256', 'ES256'].includes(h.alg)) throw new Error('unexpected algorithm ' + h.alg);
  let jwk = (await jwks(o.jwks)).find(k => k.kid === h.kid);
  if (!jwk) jwk = (await jwks(o.jwks, true)).find(k => k.kid === h.kid);
  if (!jwk) throw new Error('unknown signing key');
  const ok = crypto.verify('sha256', Buffer.from(p[0] + '.' + p[1]), h.alg === 'ES256' ? { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' } : crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(p[2], 'base64url'));
  if (!ok) throw new Error('bad signature');
  if (body.iss !== o.iss) throw new Error('wrong issuer');
  const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
  if (o.aud && !aud.includes(o.aud)) throw new Error('wrong audience');
  if (!(body.exp > nowS() - 5)) throw new Error('expired');
  if (!body.sub) throw new Error('no subject');
  return body;
}
let DISCO = null;
async function disco() {
  if (DISCO && Date.now() - DISCO.at < 3600e3) return DISCO.d;
  const r = await fetch(ISSUER + '/.well-known/openid-configuration'); if (!r.ok) throw new Error('OpenAI discovery ' + r.status);
  DISCO = { at: Date.now(), d: await r.json() }; return DISCO.d;
}
async function siteUser(ev) {
  const m = String((ev.headers || {}).authorization || '').match(/^Bearer\s+(\S+)$/i); if (!m) return null;
  try {
    const iss = process.env.COGNITO_ISSUER || 'https://cognito-idp.' + REGION + '.amazonaws.com/' + POOL_ID;
    const c = await verifyJwt(m[1], { jwks: iss + '/.well-known/jwks.json', iss, aud: COG_CLIENT });
    return c.token_use === 'id' ? c.sub : null;
  } catch (e) { return null; }
}
const scopesOf = (...xs) => new Set(xs.flatMap(x => Array.isArray(x) ? x : String(x || '').split(/[\s,]+/)).filter(Boolean));
const hostKey = 'cgpt#host', credKey = u => 'cgpt#u#' + u, pairKey = c => 'cgpt#pair#' + sha(c), subKey = s => 'cgpt#sub#' + sha(s);
async function hostId() {
  const r = await D().get(hostKey); if (r) return r.data;
  const id = 'urn:uuid:' + crypto.randomUUID();
  if (await D().put(hostKey, id, { ifVer: null })) return id;
  return (await D().get(hostKey)).data;
}

/* ---------- credentials: read, refresh one at a time, mark for sign-in again ---------- */
const UNUSABLE = ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused', 'invalid_client'];
async function loadCred(uid) {
  const row = await D().get(credKey(uid)); if (!row) return null;
  return { row, c: await open(credKey(uid), row.data) };
}
async function saveCred(uid, c, ifVer, ver) { return D().put(credKey(uid), await seal(credKey(uid), c), { ver, ifVer }); }
async function markReauth(uid, why) {
  for (let i = 0; i < 3; i++) {
    const x = await loadCred(uid); if (!x) return;
    const c = Object.assign(x.c, { state: 'reauth', lastError: why, access: null, refresh: null });
    if (await saveCred(uid, c, x.row.ver, x.row.ver + 1)) return;
  }
}
const fail = (code, message, extra) => Object.assign(new Error(message), { code }, extra || {});
async function accessToken(uid, force) {
  for (let i = 0; i < 25; i++) {
    const x = await loadCred(uid);
    if (!x) throw fail('not_connected', 'ChatGPT isn’t connected yet.');
    const c = x.c;
    if (c.state === 'reauth' || !c.refresh) throw fail('reauth', 'Your ChatGPT sign-in has ended. Connect ChatGPT again.');
    if (c.access && !force && c.atExp > Date.now() + 60e3) return { c, token: c.access };
    // take the refresh lock so two requests never spend the same rotating refresh token
    const lock = Date.now() + 20e3;
    if (!(await D().put(credKey(uid), x.row.data, { ver: x.row.ver, lock, ifVer: x.row.ver, lockFree: Date.now() }))) { await sleep(400); force = false; continue; }
    const d = await disco();
    let r, j = {};
    try {
      r = await fetch(d.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: c.clientId, refresh_token: c.refresh, resource: RESOURCE }).toString() });
      j = await r.json().catch(() => ({}));
    } catch (e) { await saveCred(uid, c, x.row.ver, x.row.ver + 1); throw fail('unavailable', 'Couldn’t reach ChatGPT. Try again in a moment.'); }
    if (r.ok && j.access_token) {
      const fresh = { access: j.access_token, refresh: j.refresh_token || c.refresh, atExp: Date.now() + (+j.expires_in || 3600) * 1000, idToken: j.id_token || c.idToken, state: 'ready', lastError: '' };
      if (await saveCred(uid, Object.assign(c, fresh), x.row.ver, x.row.ver + 1)) return { c, token: c.access };
      // the record changed meanwhile (a model choice, say): never lose the new refresh token, write it into the latest copy
      for (let k = 0; k < 5; k++) { const y = await loadCred(uid); if (!y) break; if (await saveCred(uid, Object.assign(y.c, fresh), y.row.ver, y.row.ver + 1)) return { c: y.c, token: fresh.access }; }
      throw fail('busy', 'ChatGPT is busy. Try again.');
    }
    const code = j.error && (j.error.code || j.error) || '';
    if (UNUSABLE.includes(code) || r.status === 400 || r.status === 401) { await saveCred(uid, Object.assign(c, { state: 'reauth', lastError: String(code || r.status), access: null, refresh: null }), x.row.ver, x.row.ver + 1); throw fail('reauth', 'Your ChatGPT sign-in has ended. Connect ChatGPT again.'); }
    await saveCred(uid, c, x.row.ver, x.row.ver + 1);
    throw fail('unavailable', 'ChatGPT couldn’t refresh your sign-in (' + r.status + '). Try again in a moment.');
  }
  throw fail('busy', 'ChatGPT is busy. Try again.');
}
async function models(uid, c, token) {
  if (c.models && Date.now() - c.modelsAt < MODELS_LIFE) return c.models;
  const r = await fetch(OAPI + '/models', { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) return c.models || [];
  const j = await r.json().catch(() => ({})), list = j.models || j.data || [];
  const out = list.filter(m => m && (m.visibility == null || m.visibility === 'list')).map(m => ({ slug: m.slug || m.id, name: m.display_name || m.slug || m.id })).filter(m => m.slug);
  for (let i = 0; i < 3; i++) { const x = await loadCred(uid); if (!x) break; if (await saveCred(uid, Object.assign(x.c, { models: out, modelsAt: Date.now() }), x.row.ver, x.row.ver + 1)) break; }
  return out;
}
const ERR = {
  subscription_sharing_user_not_eligible: ['not_eligible', 'Your ChatGPT plan can’t be used here. Using your plan in other apps needs ChatGPT Plus or Pro.'],
  subscription_sharing_usage_limit_exceeded: ['limit', 'You’ve reached the usage limit for this app on your ChatGPT plan. You can change it in ChatGPT settings, under Usage.'],
  subscription_sharing_usage_unavailable: ['unavailable', 'ChatGPT plan usage is unavailable right now. Try again in a moment.'],
  subscription_sharing_user_unavailable: ['unavailable', 'ChatGPT is unavailable for your account right now. Try again in a moment.'],
  subscription_sharing_unsupported_capability: ['unsupported', 'ChatGPT can’t do that kind of request through your plan.'],
  subscription_sharing_route_not_supported: ['not_allowed', 'This connection isn’t allowed to use your ChatGPT plan for this request.'],
  chatpass_v2_scope_not_authorized: ['not_allowed', 'This connection doesn’t have permission to use your ChatGPT plan. Connect ChatGPT again and allow plan usage.'],
  subscription_sharing_invalid_user: ['reauth', 'Your ChatGPT sign-in is no longer valid. Connect ChatGPT again.']
};

/* ---------- HTTP (function URL with response streaming) ---------- */
function reply(stream, code, obj) {
  const s = awslambda.HttpResponseStream.from(stream, { statusCode: code, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  s.write(obj == null ? '' : JSON.stringify(obj)); s.end();
}
function bodyOf(ev) { try { return JSON.parse(ev.isBase64Encoded ? Buffer.from(ev.body || '', 'base64').toString('utf8') : (ev.body || '{}')); } catch (e) { return null; } }

async function ask(uid, b, stream) {
  const out = awslambda.HttpResponseStream.from(stream, { statusCode: 200, headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
  const line = o => out.write(JSON.stringify(o) + '\n');
  try {
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-40) : [];
    const input = msgs.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).map(m => ({ role: m.role, content: m.content.slice(0, 30000) }));
    if (!input.length || input[input.length - 1].role !== 'user') throw fail('bad_request', 'Nothing to ask.');
    if (input.reduce((n, m) => n + m.content.length, 0) > 120000) throw fail('bad_request', 'That is too much text for one question. Start a new chat.');
    let { c, token } = await accessToken(uid);
    const list = await models(uid, c, token);
    const model = (list.find(m => m.slug === c.model) || list[0] || {}).slug;
    if (!model) throw fail('no_models', 'ChatGPT didn’t offer any models for your plan.');
    const payload = JSON.stringify({ model, input, instructions: String(b.instructions || '').slice(0, 12000) || undefined, store: false, stream: true });
    let r;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch(OAPI + '/responses', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'text/event-stream' }, body: payload });
      if (r.ok) break;
      const j = await r.json().catch(() => ({})), code = j.error && (j.error.code || j.error.type) || '';
      if (code === 'subscription_sharing_invalid_user') { await markReauth(uid, code); throw fail('reauth', ERR[code][1]); }
      if (r.status === 401 && attempt === 0) { ({ token } = await accessToken(uid, true)); continue; }   // token rejected early: refresh once
      if (r.status === 401) { await markReauth(uid, code || '401'); throw fail('reauth', 'ChatGPT no longer accepts this connection. Connect ChatGPT again.'); }
      if (r.status === 503 && attempt < 3) { await sleep([800, 2000, 4000][attempt]); continue; }   // bounded backoff
      const e = ERR[code];
      if (e) throw fail(e[0], e[1] + (e[0] === 'unsupported' && j.error.message ? ' (' + String(j.error.message).slice(0, 160) + ')' : ''), { status: r.status, oaiCode: code });
      if (r.status === 403) throw fail('not_allowed', 'ChatGPT refused this request (' + (code || 403) + '). It may not be available in your region or for this connection.');
      if (r.status === 429) throw fail('limit', 'ChatGPT is limiting requests right now. Wait a minute and try again.');
      throw fail('error', 'ChatGPT had a problem (' + r.status + (code ? ', ' + code : '') + ').');
    }
    if (!r.ok) throw fail('unavailable', 'ChatGPT is unavailable right now. Try again in a moment.');
    line({ t: 'start', model, name: (list.find(m => m.slug === model) || {}).name || model });
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', done = false, partial = false;
    const handle = ev => {
      if (ev.type === 'response.output_text.delta' && ev.delta) line({ t: 'delta', d: ev.delta });
      else if (ev.type === 'response.completed') done = true;
      else if (ev.type === 'response.incomplete') partial = true;
      else if (ev.type === 'response.failed' || ev.type === 'error') {
        const er = (ev.response && ev.response.error) || ev.error || ev, code = er.code || '';
        const e = ERR[code];
        throw fail(e ? e[0] : 'error', e ? e[1] : 'ChatGPT stopped with an error' + (code ? ' (' + code + ')' : '') + '.');
      }
    };
    for (;;) {
      const { value, done: end } = await rd.read();
      if (value) buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
        const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
        if (data && data !== '[DONE]') { let ev; try { ev = JSON.parse(data); } catch (e) { continue; } handle(ev); }
      }
      if (end) break;
    }
    if (done) line({ t: 'done' });
    else line({ t: 'error', code: partial ? 'incomplete' : 'cut_off', message: partial ? 'ChatGPT stopped before finishing. Ask it to continue.' : 'The answer was cut off. Try again.' });
  } catch (e) {
    if (e.code === 'limit' || e.code === 'not_eligible' || e.code === 'not_allowed') {
      for (let i = 0; i < 3; i++) { const x = await loadCred(uid).catch(() => null); if (!x) break; if (await saveCred(uid, Object.assign(x.c, { lastError: e.code, lastErrorAt: Date.now() }), x.row.ver, x.row.ver + 1)) break; }
    }
    if (!e.code) console.error(e);
    line({ t: 'error', code: e.code || 'error', message: e.code ? e.message : 'Something went wrong on the study server.' });
  }
  out.end();
}

async function route(ev, stream) {
  const method = ev.requestContext.http.method, path = (ev.rawPath || '/').replace(/\/+$/, '') || '/';
  const q = Object.fromEntries(new URLSearchParams(ev.rawQueryString || ''));
  if (method === 'OPTIONS') return reply(stream, 204, null);
  if (path === '/pair-info' && method === 'GET') {
    const p = q.code && await D().get(pairKey(q.code)); let v = null; try { v = p && JSON.parse(p.data); } catch (e) { }
    if (!v || v.exp < nowS()) return reply(stream, 404, { error: 'This pairing code is unknown or expired. Make a new one on the study website.' });
    return reply(stream, 200, { hostId: await hostId(), app: 'ARE Study System', issuer: ISSUER, resource: RESOURCE, scopes: 'openid profile email offline_access resource.invoke ' + PLAN_SCOPE });
  }
  if (path === '/import' && method === 'POST') {
    const b = bodyOf(ev) || {};
    const p = b.code && await D().take(pairKey(b.code)); let v = null; try { v = p && JSON.parse(p.data); } catch (e) { }
    if (!v || v.exp < nowS()) return reply(stream, 400, { error: 'This pairing code is unknown, used or expired. Make a new one on the study website.' });
    if (!b.client_id || b.client_id === 'dynamic_agent_client' || !b.refresh_token || !b.id_token) return reply(stream, 400, { error: 'The sign-in result is incomplete (client_id, refresh_token and id_token are needed).' });
    const d = await disco();
    let idc;
    try { idc = await verifyJwt(b.id_token, { jwks: d.jwks_uri, iss: d.issuer, aud: b.client_id }); }
    catch (e) { return reply(stream, 400, { error: 'The ChatGPT sign-in could not be verified: ' + e.message + '.' }); }
    let atScope = ''; try { atScope = b64json(String(b.access_token || '').split('.')[1] || '').scope || ''; } catch (e) { }
    const granted = scopesOf(b.scope, idc.granted_scopes, atScope);
    if (!granted.has(PLAN_SCOPE)) return reply(stream, 400, { error: 'ChatGPT didn’t allow plan usage for this sign-in, so the study site can’t send questions. Sign in again and allow using your ChatGPT plan.' });
    const ident = idc.iss + '|' + idc.sub, link = await D().get(subKey(ident));
    if (link && link.data !== v.uid) return reply(stream, 409, { error: 'This ChatGPT account is already connected to another study account. Disconnect it there first.' });
    const old = await D().get(credKey(v.uid));
    const c = { clientId: b.client_id, access: b.access_token || null, atExp: Date.now() + (+b.expires_in || 0) * 1000, refresh: b.refresh_token, idToken: b.id_token, scopes: [...granted],
      sub: idc.sub, ident, email: idc.email || '', name: idc.name || '', linkedAt: Date.now(), state: 'ready', lastError: '', model: '', models: null, modelsAt: 0 };
    if (old) { try { const oc = await open(credKey(v.uid), old.data); if (oc.ident && oc.ident !== ident) await D().del(subKey(oc.ident)); c.model = oc.model || ''; } catch (e) { } }
    await D().put(credKey(v.uid), await seal(credKey(v.uid), c), { ver: (old ? old.ver : 0) + 1 });
    await D().put(subKey(ident), v.uid, {});
    return reply(stream, 200, { ok: true, email: c.email });
  }
  const uid = await siteUser(ev);
  if (!uid) return reply(stream, 401, { error: 'Sign in to the study website first.' });
  if (path === '/pair' && method === 'POST') {
    const code = rnd(18);
    await D().put(pairKey(code), JSON.stringify({ uid, exp: nowS() + PAIR_LIFE }), { ttl: nowS() + PAIR_LIFE + 60 });
    return reply(stream, 200, { code, expiresIn: PAIR_LIFE });
  }
  if (path === '/status' && method === 'GET') {
    const x = await loadCred(uid);
    if (!x) return reply(stream, 200, { connected: false });
    const c = x.c, out = { connected: true, state: c.state, email: c.email, name: c.name, linkedAt: c.linkedAt, model: c.model || '', lastError: c.lastError || '', models: c.models || [] };
    if (c.state !== 'reauth' && q.models) { try { const a = await accessToken(uid); out.models = await models(uid, a.c, a.token); } catch (e) { out.state = e.code === 'reauth' ? 'reauth' : out.state; out.lastError = e.code; } }
    if (!out.model && out.models[0]) out.model = out.models[0].slug;
    return reply(stream, 200, out);
  }
  if (path === '/model' && method === 'POST') {
    const b = bodyOf(ev) || {};
    for (let i = 0; i < 3; i++) { const x = await loadCred(uid); if (!x) break; if (!(x.c.models || []).some(m => m.slug === b.model)) return reply(stream, 400, { error: 'Unknown model.' });
      if (await saveCred(uid, Object.assign(x.c, { model: b.model }), x.row.ver, x.row.ver + 1)) return reply(stream, 200, { ok: true }); }
    return reply(stream, 409, { error: 'Try again.' });
  }
  if (path === '/disconnect' && method === 'POST') {
    const x = await loadCred(uid).catch(() => null);
    if (x && x.c.refresh) {
      try { const d = await disco(); if (d.revocation_endpoint) await fetch(d.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: x.c.refresh, token_type_hint: 'refresh_token', client_id: x.c.clientId }).toString() }); }
      catch (e) { console.error('revoke failed', e && e.message); }
    }
    if (x && x.c.ident) await D().del(subKey(x.c.ident));
    await D().del(credKey(uid));
    return reply(stream, 200, { ok: true });
  }
  if (path === '/ask' && method === 'POST') return ask(uid, bodyOf(ev) || {}, stream);
  return reply(stream, 404, { error: 'not found' });
}
exports.handler = awslambda.streamifyResponse(async (ev, stream) => {
  try { await route(ev, stream); }
  catch (e) { console.error(e); try { reply(stream, 500, { error: 'server error' }); } catch (_) { } }
});
exports._test = { setDeps: d => { deps = d; } };
