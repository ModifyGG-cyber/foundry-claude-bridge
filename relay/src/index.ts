#!/usr/bin/env node
import { timingSafeEqual } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadBaseConfig, loadHttpConfig, newKey, type BaseConfig } from './config.js';
import { mountHttpMcp } from './http.js';
import { FoundryHub } from './hub.js';
import { availableTools, buildServer, VERSION } from './mcp.js';

const args = new Set(process.argv.slice(2));

if (args.has('--new-key')) {
  console.log(newKey());
  process.exit(0);
}

const httpMode = args.has('--http');
// In stdio mode stdout carries MCP messages, so every log line goes to stderr.
const log = (msg: string) => console.error(`[foundry-bridge] ${msg}`);

let config: BaseConfig;
try {
  config = httpMode ? loadHttpConfig() : loadBaseConfig('127.0.0.1');
} catch (error) {
  log((error as Error).message);
  process.exit(1);
}

const stateFile = join(process.env.BRIDGE_STATE_DIR ?? join(homedir(), '.foundry-claude-bridge'), 'last-world.json');
const hub = new FoundryHub(config.foundryKey, config.callTimeoutMs, log, stateFile);
const app = express();
app.disable('x-powered-by');
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    tools: availableTools(hub.system).length,
    foundry: hub.connected ? { connected: true, since: hub.connectedAt, world: hub.world } : { connected: false },
  });
});

if (httpMode) {
  const mcpUrl = mountHttpMcp(app, hub, loadHttpConfig());
  log(`MCP endpoint for Claude: ${mcpUrl}`);
}

// A newer copy started by Claude Desktop asks an older one on the same port to step aside (stdio mode only).
const sameKey = (given: unknown) =>
  typeof given === 'string' && given.length === config.foundryKey.length && timingSafeEqual(Buffer.from(given), Buffer.from(config.foundryKey));
if (!httpMode) {
  app.post('/shutdown', (req, res) => {
    if (!sameKey(req.get('x-foundry-key'))) {
      res.status(403).end();
      return;
    }
    log('a newer copy of the bridge took over the port; exiting');
    res.json({ ok: true });
    setTimeout(() => process.exit(0), 50);
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function askOldCopyToExit() {
  try {
    const res = await fetch(`http://127.0.0.1:${String(config.port)}/shutdown`, {
      method: 'POST',
      headers: { 'x-foundry-key': config.foundryKey },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function listenOnce() {
  return new Promise<import('node:http').Server>((resolve, reject) => {
    const server = app.listen(config.port, config.host);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

async function listen() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await listenOnce();
    } catch (error) {
      const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (!inUse || httpMode || attempt >= 10) {
        log(`could not listen on ${config.host}:${config.port}: ${(error as Error).message}`);
        if (inUse) log('another program is using this port. Close it, or set PORT to a different number in both the bridge and the Foundry module settings.');
        process.exit(1);
      }
      if (attempt === 0) log(`port ${String(config.port)} is busy; asking an older copy of the bridge to exit`);
      if (attempt === 0) await askOldCopyToExit();
      await sleep(300);
    }
  }
}

const httpServer = await listen();
log(`v${VERSION} listening on ${config.host}:${config.port}; module WebSocket URL: ws://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/ws`);
httpServer.on('error', error => log(`server error: ${error.message}`));
hub.attach(httpServer);

if (!httpMode) {
  const server = buildServer(hub);
  hub.onChange(() => {
    server.sendToolListChanged().catch(() => {});
  });
  await server.connect(new StdioServerTransport());
  // Claude Desktop closes stdin when it stops the server; take the WebSocket port down with us.
  process.stdin.on('end', () => process.exit(0));
  process.stdin.on('close', () => process.exit(0));
  // If Desktop goes away without closing stdin, notice that too, so no orphan keeps the port.
  const parent = process.ppid;
  setInterval(() => {
    try {
      process.kill(parent, 0);
    } catch {
      log('Claude Desktop is gone; exiting');
      process.exit(0);
    }
  }, 5000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => process.exit(0));
}
