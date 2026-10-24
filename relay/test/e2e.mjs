// End-to-end: real relay process, fake Foundry module over WebSocket, real MCP client, real OAuth flow.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { install, chat } from './fake-foundry.mjs';

const PORT = 18787;
const BASE = `http://localhost:${PORT}`;
const env = {
  ...process.env,
  PUBLIC_URL: BASE,
  PORT: String(PORT),
  FOUNDRY_SECRET: 'x'.repeat(32),
  RELAY_PASSWORD: 'correct horse battery',
  API_KEY: 'k'.repeat(40),
  DATA_DIR: mkdtempSync(join(tmpdir(), 'relay-')),
  CALL_TIMEOUT_MS: '3000',
};

const relay = spawn('node', ['dist/index.js'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(resolve => relay.stdout.on('data', d => String(d).includes('listening') && resolve()));
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push(`ok   ${label}`); }
  catch (e) { results.push(`FAIL ${label}: ${e.message}`); process.exitCode = 1; }
};

const mcp = async token => {
  const client = new Client({ name: 'e2e', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', BASE), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
};
const call = async (client, name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { error: res.isError, data: res.isError ? res.content[0].text : JSON.parse(res.content[0].text) };
};

try {
  await check('unauthenticated /mcp gets 401 with resource metadata', async () => {
    const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate'), /resource_metadata=/);
  });

  const client = await mcp(env.API_KEY);
  await check('tools are listed', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['actor-get', 'actor-list', 'chat-send', 'journal-get', 'journal-search', 'world-info']);
  });
  await check('calls fail clearly while Foundry is offline', async () => {
    const r = await call(client, 'world-info');
    assert.ok(r.error);
    assert.match(r.data, /not connected/);
  });

  await check('bad module secret is rejected', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/foundry`);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify({ type: 'hello', secret: 'wrong', world: {} }));
    const code = await new Promise(r => ws.on('close', c => r(c)));
    assert.equal(code, 4001);
  });

  // Fake module: the real handlers.js against fake Foundry globals.
  install();
  const { handlers } = await import('../../module/scripts/handlers.js');
  const ws = new WebSocket(`ws://localhost:${PORT}/foundry`);
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'hello', secret: env.FOUNDRY_SECRET, world: { title: 'Nyarlathotep', system: 'CoC7', foundryVersion: '14.369', gm: 'Gamemaster' } }));
  ws.on('message', async raw => {
    const msg = JSON.parse(raw);
    if (msg.type !== 'call') return;
    try {
      ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, data: await handlers[msg.tool].run(msg.args) }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: false, error: e.message }));
    }
  });
  await new Promise(r => ws.once('message', r)); // welcome

  await check('health shows the connected world', async () => {
    const h = await (await fetch(`${BASE}/health`)).json();
    assert.equal(h.foundry.connected, true);
    assert.equal(h.foundry.world.system, 'CoC7');
  });
  await check('world-info', async () => {
    const r = await call(client, 'world-info');
    assert.equal(r.data.system.id, 'CoC7');
    assert.equal(r.data.counts.actors, 2);
    assert.equal(r.data.compendiums[0].count, 103);
  });
  await check('actor-list filters by type and folder', async () => {
    assert.equal((await call(client, 'actor-list', { type: 'character' })).data.actors[0].name, 'Harvey Walters');
    assert.equal((await call(client, 'actor-list', { folder: 'investigators' })).data.total, 1);
    assert.equal((await call(client, 'actor-list', { name: 'ELIAS' })).data.actors[0].id, 'a1');
  });
  await check('actor-get by name, with items', async () => {
    const r = await call(client, 'actor-get', { name: 'harvey walters', includeItemData: true });
    assert.equal(r.data.system.characteristics.int.value, 85);
    assert.equal(r.data.items[0].system.value, 60);
  });
  await check('actor-get unknown name is a clean error', async () => {
    const r = await call(client, 'actor-get', { name: 'Nyarlathotep' });
    assert.ok(r.error);
    assert.match(r.data, /No actor found/);
  });
  await check('journal-search matches names and page text', async () => {
    assert.equal((await call(client, 'journal-search', { query: 'ju-ju' })).data.results[0].matched, 'name');
    const r = await call(client, 'journal-search', { query: 'new york telegram' });
    assert.equal(r.data.results[0].pageId, 'p1');
    assert.match(r.data.results[0].snippet, /Telegram from Jackson Elias/);
  });
  await check('journal-get returns plain text and pages through long entries', async () => {
    const r = await call(client, 'journal-get', { id: 'j1' });
    assert.match(r.data.pages[0].text, /Jackson Elias\.\nCome to New York/);
    assert.equal(r.data.pages[1].src, 'maps/peru.webp');
    const first = await call(client, 'journal-get', { name: 'Ju-Ju House', maxChars: 500 });
    assert.equal(first.data.truncated, true);
    const second = await call(client, 'journal-get', { name: 'Ju-Ju House', maxChars: 500, offset: first.data.nextOffset });
    assert.equal(second.data.pages[0].startsAt, 500);
    assert.equal(first.data.pages[0].text.length + second.data.pages[0].text.length, Math.min(1000, first.data.totalChars));
  });
  await check('chat-send as an actor, whispered', async () => {
    const r = await call(client, 'chat-send', { content: 'Hello', speakerActorName: 'Jackson Elias', whisperToGM: true });
    assert.equal(r.data.speaker, 'Jackson Elias');
    assert.deepEqual(chat.at(-1).whisper, ['u1']);
  });

  await check('OAuth: register, sign in, exchange, refresh', async () => {
    const reg = await (await fetch(`${BASE}/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: '<Claude>', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }),
    })).json();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const auth = new URL('/authorize', BASE);
    Object.entries({ client_id: reg.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'st8' })
      .forEach(([k, v]) => auth.searchParams.set(k, v));
    const page = await (await fetch(auth)).text();
    assert.match(page, /&#60;Claude&#62;/, 'client name is escaped');
    const request = page.match(/name="request" value="([^"]+)"/)[1];
    const login = body => fetch(`${BASE}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    assert.equal((await login({ request, password: 'nope', action: 'allow' })).status, 401);
    const ok = await login({ request, password: env.RELAY_PASSWORD, action: 'allow' });
    assert.equal(ok.status, 302);
    const redirect = new URL(ok.headers.get('location'));
    assert.equal(redirect.searchParams.get('state'), 'st8');
    const token = async body => (await fetch(`${BASE}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: reg.client_id, ...body }) })).json();
    const t1 = await token({ grant_type: 'authorization_code', code: redirect.searchParams.get('code'), code_verifier: verifier, redirect_uri: 'https://claude.ai/api/mcp/auth_callback' });
    assert.ok(t1.access_token && t1.refresh_token, JSON.stringify(t1));
    const viaOAuth = await mcp(t1.access_token);
    assert.equal((await call(viaOAuth, 'world-info')).data.world.title, 'Nyarlathotep');
    const t2 = await token({ grant_type: 'refresh_token', refresh_token: t1.refresh_token });
    assert.ok(t2.access_token);
    const reused = await token({ grant_type: 'refresh_token', refresh_token: t1.refresh_token });
    assert.ok(reused.error, 'old refresh token is rotated out');
  });

  await check('Foundry disconnect mid-session fails fast', async () => {
    ws.close();
    await new Promise(r => setTimeout(r, 100));
    const r = await call(client, 'world-info');
    assert.match(r.data, /not connected/);
  });
} finally {
  relay.kill();
  console.log(results.join('\n'));
}
