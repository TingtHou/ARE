#!/usr/bin/env node
// Connect your ChatGPT plan to the ARE Study System.
// Run on your own computer (Node.js 18 or newer), with the command the study website shows you:
//   node chatgpt-signin.mjs <server address> <pairing code>
// It opens ChatGPT's sign-in in your browser, receives the answer on this computer (127.0.0.1),
// checks it, and sends the credentials straight to your study account over HTTPS. Nothing is written to disk.
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const [server, code] = process.argv.slice(2);
if (!server || !code) { console.error('Usage: node chatgpt-signin.mjs <server address> <pairing code>\nCopy the full command from the study website (Claude & ChatGPT → Continue with ChatGPT).'); process.exit(1); }
const API = server.replace(/\/+$/, '');
const ISSUER = (process.env.OPENAI_ISSUER || 'https://auth.openai.com').replace(/\/+$/, '');
const APP = 'ARE Study System';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const b64 = b => Buffer.from(b).toString('base64url');
const die = m => { console.error('\n✗ ' + m); process.exit(1); };
const getJson = async (url, init) => { const r = await fetch(url, init); const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { error: t.slice(0, 200) }; } return { ok: r.ok, status: r.status, j }; };

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch (e) { }
}
async function verifyIdToken(tok, d, aud, nonce) {
  const [h64, p64, s64] = String(tok).split('.'); const h = JSON.parse(Buffer.from(h64, 'base64url')), p = JSON.parse(Buffer.from(p64, 'base64url'));
  const keys = (await getJson(d.jwks_uri)).j.keys || [], jwk = keys.find(k => k.kid === h.kid);
  if (!jwk || !['RS256', 'ES256'].includes(h.alg)) throw new Error('unknown signing key');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  if (!crypto.verify('sha256', Buffer.from(h64 + '.' + p64), h.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key, Buffer.from(s64, 'base64url'))) throw new Error('bad signature');
  if (p.iss !== d.issuer) throw new Error('wrong issuer');
  if (!(Array.isArray(p.aud) ? p.aud : [p.aud]).includes(aud)) throw new Error('wrong audience');
  if (p.nonce !== nonce) throw new Error('nonce mismatch');
  if (!(p.exp > Date.now() / 1000 - 5)) throw new Error('expired');
  if (!p.sub) throw new Error('no subject');
  return p;
}

console.log('ARE Study System · Continue with ChatGPT\n');
const info = await getJson(API + '/pair-info?code=' + encodeURIComponent(code));
if (!info.ok) die(info.j.error || 'The study server did not recognise this pairing code (' + info.status + ').');
const d = (await getJson(ISSUER + '/.well-known/openid-configuration')).j;
if (!d.authorization_endpoint || !d.token_endpoint) die('Could not read ChatGPT’s sign-in settings. Check your internet connection.');

const state = b64(crypto.randomBytes(32)), nonce = b64(crypto.randomBytes(32)), verifier = b64(crypto.randomBytes(48));
const challenge = b64(crypto.createHash('sha256').update(verifier).digest());
let finish; const result = new Promise(r => { finish = r; });
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
  const page = (title, msg) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><meta charset="utf-8"><title>' + title + '</title><body style="font:16px system-ui;max-width:420px;margin:15vh auto;padding:0 16px"><h2>' + title + '</h2><p>' + msg + '</p></body>'); };
  if (u.searchParams.get('state') !== state) { page('Something went wrong', 'This sign-in did not come from this window. Close it and run the command again.'); return; }
  if (u.searchParams.get('error')) { page('Not connected', 'ChatGPT said: ' + u.searchParams.get('error') + '. You can close this tab.'); finish({ error: u.searchParams.get('error') }); return; }
  page('Almost done', 'You can close this tab and go back to the terminal.');
  finish({ code: u.searchParams.get('code'), clientId: u.searchParams.get('client_id'), scope: u.searchParams.get('scope') || '' });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const redirectUri = 'http://127.0.0.1:' + srv.address().port + '/callback';
const auth = new URL(d.authorization_endpoint);
Object.entries({ client_id: 'dynamic_agent_client', agent_name_hint: APP, ext_agent_host_id: info.j.hostId, response_type: 'code', redirect_uri: redirectUri,
  scope: info.j.scopes || 'openid profile email offline_access resource.invoke ' + PLAN_SCOPE, resource: info.j.resource || 'https://api.openai.com/v1',
  state, nonce, code_challenge_method: 'S256', code_challenge: challenge }).forEach(([k, v]) => auth.searchParams.set(k, v));
console.log('Opening ChatGPT in your browser. Sign in, choose your account, and allow using your ChatGPT plan.');
console.log('If no browser opens, paste this address into one on this computer:\n\n' + auth + '\n');
if (!process.env.ARE_NO_BROWSER) openBrowser(auth.toString());
const timer = setTimeout(() => finish({ error: 'timed out after 10 minutes' }), 600000);
const cb = await result; clearTimeout(timer); srv.close();
if (cb.error) die('Not connected: ' + cb.error);
if (!cb.code || !cb.clientId || cb.clientId === 'dynamic_agent_client') die('ChatGPT did not return a client ID with the sign-in. Run the command again.');

const tok = await getJson(d.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', client_id: cb.clientId, code: cb.code, code_verifier: verifier, redirect_uri: redirectUri, resource: info.j.resource || 'https://api.openai.com/v1' }).toString() });
if (!tok.ok || !tok.j.id_token) die('ChatGPT did not finish the sign-in (' + tok.status + (tok.j.error ? ', ' + (tok.j.error.code || tok.j.error) : '') + ').');
let idc; try { idc = await verifyIdToken(tok.j.id_token, d, cb.clientId, nonce); } catch (e) { die('The ChatGPT sign-in could not be verified: ' + e.message); }
let atScope = ''; try { atScope = JSON.parse(Buffer.from(tok.j.access_token.split('.')[1], 'base64url')).scope || ''; } catch (e) { }
const granted = new Set([tok.j.scope, cb.scope, atScope].concat(idc.granted_scopes || []).join(' ').split(/[\s,]+/).filter(Boolean));
if (!granted.has(PLAN_SCOPE)) die('You are signed in, but ChatGPT did not allow plan usage, so the study site can’t send questions. Run the command again and allow using your ChatGPT plan. (Plan usage needs ChatGPT Plus or Pro.)');

const imp = await getJson(API + '/import', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code, client_id: cb.clientId, access_token: tok.j.access_token, refresh_token: tok.j.refresh_token, id_token: tok.j.id_token, expires_in: tok.j.expires_in, scope: [...granted].join(' ') }) });
if (!imp.ok) die(imp.j.error || 'The study server did not accept the sign-in (' + imp.status + ').');
console.log('\n✓ Connected' + (idc.email ? ' as ' + idc.email : '') + '. Go back to the study website; it will show ChatGPT as connected.');
console.log('  Eligible AI requests on the study site will use your ChatGPT plan. You can manage usage in ChatGPT settings: https://chatgpt.com/settings/usage');
process.exit(0);
