#!/usr/bin/env node
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

const httpServer = app.listen(config.port, config.host, () => {
  log(`v${VERSION} listening on ${config.host}:${config.port}; module WebSocket URL: ws://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/ws`);
});
httpServer.on('error', error => {
  log(`could not listen on ${config.host}:${config.port}: ${error.message}`);
  process.exit(1);
});
hub.attach(httpServer);

if (!httpMode) {
  const server = buildServer(hub);
  hub.onChange(() => {
    server.sendToolListChanged().catch(() => {});
  });
  await server.connect(new StdioServerTransport());
  // Claude Desktop closes stdin when it quits; take the WebSocket port down with us.
  process.stdin.on('close', () => process.exit(0));
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => process.exit(0));
}
