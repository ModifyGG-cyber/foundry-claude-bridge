// End-to-end tests: the real relay process, a fake Foundry module speaking the
// module's wire protocol, and the official MCP client over stdio and HTTP.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

const KEY = `pk_${'a'.repeat(30)}`;
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push(`ok   ${label}`); }
  catch (e) { results.push(`FAIL ${label}: ${e.message}`); process.exitCode = 1; }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A stand-in for the Foundry module: answers commands from a table of handlers. */
function fakeModule(port, { key = KEY, system = 'dnd5e', handlers = {} } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?apiKey=${encodeURIComponent(key)}`);
  ws.received = [];
  ws.on('message', async raw => {
    const msg = JSON.parse(raw);
    if (msg.type === 'pong') { ws.gotPong = true; return; }
    ws.received.push(msg);
    const all = {
      'get-world-info': () => ({ world: { id: 'w', title: 'Test World', system, systemVersion: '1', foundryVersion: '14.369' }, counts: {}, compendiumMeta: [] }),
      ...handlers,
    };
    const handler = all[msg.type];
    if (handler === 'silent') return;
    try {
      if (!handler) throw new Error(`Unknown command type: ${msg.type}`);
      ws.send(JSON.stringify({ id: msg.id, success: true, data: await handler(msg.params) }));
    } catch (e) {
      ws.send(JSON.stringify({ id: msg.id, success: false, error: e.message }));
    }
  });
  ws.opened = new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  ws.closed = new Promise(resolve => ws.on('close', code => resolve(code)));
  return ws;
}

const text = res => res.content[0].text;
const json = res => JSON.parse(text(res));

// ── stdio mode (Claude Desktop) ───────────────────────────────────────────
{
  const PORT = 18788;
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: { ...process.env, FOUNDRY_KEY: KEY, PORT: String(PORT), CALL_TIMEOUT_MS: '1500' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'e2e', version: '0' });
  let listChanged = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => { listChanged++; });
  await client.connect(transport);
  await sleep(300);

  try {
    await check('stdio: every tool is listed before Foundry connects', async () => {
      const { tools } = await client.listTools();
      assert.equal(tools.length, 158);
      const skill = tools.find(t => t.name === 'dnd5e-roll-skill');
      assert.deepEqual(skill.inputSchema.required, ['actorId', 'skill']);
      assert.equal(tools.find(t => t.name === 'clear-chat').annotations.destructiveHint, true);
      assert.equal(tools.find(t => t.name === 'get-actor').annotations.readOnlyHint, true);
    });

    await check('stdio: calls fail clearly while Foundry is offline', async () => {
      const res = await client.callTool({ name: 'get-actors', arguments: {} });
      assert.ok(res.isError);
      assert.match(text(res), /not connected/);
    });

    await check('wrong API key is closed with 4001', async () => {
      const ws = fakeModule(PORT, { key: `pk_${'b'.repeat(30)}` });
      assert.equal(await ws.closed, 4001);
    });

    const calls = [];
    const mod = fakeModule(PORT, {
      system: 'CoC7',
      handlers: {
        'get-actor': params => { calls.push(params); return { id: params.actorId, name: 'Harvey Walters', system: { san: { value: 55 } } }; },
        'delete-actor': () => { throw new Error('Actor not found: zzz'); },
        'capture-scene': () => ({ sceneId: 's', sceneName: 'Arkham', image: 'UklGRg==', mimeType: 'image/webp', width: 10, height: 10 }),
        'get-pause-state': 'silent',
      },
    });
    await mod.opened;
    await sleep(300);

    await check('connect learns the system and notifies a tool-list change', async () => {
      assert.ok(listChanged >= 1);
      const { tools } = await client.listTools();
      assert.ok(!tools.some(t => t.name.startsWith('dnd5e-') || t.name.startsWith('pf2e-')), 'no dnd5e/pf2e tools in a CoC7 world');
      assert.ok(tools.some(t => t.name === 'get-actor'));
    });

    await check('module ping gets a pong', async () => {
      mod.send(JSON.stringify({ type: 'ping', ts: 1 }));
      await sleep(100);
      assert.ok(mod.gotPong);
    });

    await check('a tool call becomes a wire command and returns its data', async () => {
      const res = await client.callTool({ name: 'get-actor', arguments: { actorId: 'a2' } });
      assert.equal(json(res).system.san.value, 55);
      assert.deepEqual(calls.at(-1), { actorId: 'a2' });
      assert.equal(mod.received.at(-1).type, 'get-actor');
    });

    await check('module errors come back as tool errors', async () => {
      const res = await client.callTool({ name: 'delete-actor', arguments: { actorId: 'zzz' } });
      assert.ok(res.isError);
      assert.equal(text(res), 'Actor not found: zzz');
    });

    await check('screenshots are returned as image content', async () => {
      const res = await client.callTool({ name: 'capture-scene', arguments: {} });
      assert.equal(res.content[1].type, 'image');
      assert.equal(res.content[1].mimeType, 'image/webp');
      assert.match(json(res).image, /attached as image 1/);
    });

    await check('an unanswered command times out', async () => {
      const res = await client.callTool({ name: 'get-pause-state', arguments: {} });
      assert.ok(res.isError);
      assert.match(text(res), /did not answer/);
    });

    await check('a second GM connection replaces the first with 4002', async () => {
      const second = fakeModule(PORT, { system: 'dnd5e' });
      await second.opened;
      assert.equal(await mod.closed, 4002);
      await sleep(300);
      const { tools } = await client.listTools();
      assert.ok(tools.some(t => t.name === 'dnd5e-roll-skill'), 'dnd5e tools appear for a dnd5e world');
      assert.ok(!tools.some(t => t.name.startsWith('pf2e-')));
      second.close();
    });
  } finally {
    await client.close();
  }
}

// ── HTTP mode (claude.ai or a remote relay) ───────────────────────────────
{
  const PORT = 18787;
  const BASE = `http://localhost:${PORT}`;
  const env = {
    ...process.env,
    FOUNDRY_KEY: KEY,
    PUBLIC_URL: BASE,
    PORT: String(PORT),
    RELAY_PASSWORD: 'correct horse battery',
    API_KEY: 'k'.repeat(40),
    DATA_DIR: mkdtempSync(join(tmpdir(), 'relay-')),
  };
  const relay = spawn('node', ['dist/index.js', '--http'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise(resolve => relay.stderr.on('data', d => String(d).includes('listening') && resolve()));
  const mcp = async token => {
    const client = new Client({ name: 'e2e', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', BASE), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return client;
  };

  try {
    await check('http: unauthenticated /mcp gets 401 with resource metadata', async () => {
      const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(res.status, 401);
      assert.match(res.headers.get('www-authenticate'), /resource_metadata=/);
    });

    const mod = fakeModule(PORT, { handlers: { 'get-actors': () => [{ id: 'a1', name: 'Goblin', type: 'npc' }] } });
    await mod.opened;
    await sleep(200);

    await check('http: API key bearer works and health shows the world', async () => {
      const client = await mcp(env.API_KEY);
      const res = await client.callTool({ name: 'get-actors', arguments: {} });
      assert.equal(json(res)[0].name, 'Goblin');
      const health = await (await fetch(`${BASE}/health`)).json();
      assert.equal(health.foundry.world.system, 'dnd5e');
    });

    await check('http: OAuth register, sign in, exchange, refresh', async () => {
      const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
      const reg = await (await fetch(`${BASE}/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: '<Claude>', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }),
      })).json();
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const auth = new URL('/authorize', BASE);
      Object.entries({ client_id: reg.client_id, redirect_uri: redirectUri, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'st8' })
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
      const t1 = await token({ grant_type: 'authorization_code', code: redirect.searchParams.get('code'), code_verifier: verifier, redirect_uri: redirectUri });
      assert.ok(t1.access_token && t1.refresh_token, JSON.stringify(t1));
      const viaOAuth = await mcp(t1.access_token);
      assert.equal(json(await viaOAuth.callTool({ name: 'get-actors', arguments: {} }))[0].id, 'a1');
      const t2 = await token({ grant_type: 'refresh_token', refresh_token: t1.refresh_token });
      assert.ok(t2.access_token);
      assert.ok((await token({ grant_type: 'refresh_token', refresh_token: t1.refresh_token })).error, 'old refresh token is rotated out');
    });
    mod.close();
  } finally {
    relay.kill();
  }
}

console.log(results.join('\n'));
