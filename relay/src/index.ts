import express from 'express';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SingleUserAuthProvider } from './auth.js';
import { loadConfig } from './config.js';
import { FoundryHub } from './hub.js';
import { Store } from './store.js';
import { buildServer, TOOLS } from './tools.js';

const VERSION = '0.1.0';
const config = loadConfig();
const store = new Store(config.dataDir);
const provider = new SingleUserAuthProvider(store, config.password, config.apiKey);
const hub = new FoundryHub(config.foundrySecret, config.callTimeoutMs);
const mcpUrl = new URL('/mcp', config.publicUrl);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: config.publicUrl,
    resourceServerUrl: mcpUrl,
    resourceName: 'Foundry bridge',
  }),
);
app.post('/login', express.urlencoded({ extended: false, limit: '8kb' }), provider.handleLogin);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    tools: TOOLS.length,
    foundry: hub.connected ? { connected: true, since: hub.connectedAt, world: hub.world } : { connected: false },
  });
});

const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) });

// Stateless Streamable HTTP: a fresh MCP server per request, all sharing one hub.
app.post('/mcp', bearer, express.json({ limit: '4mb' }), async (req, res) => {
  const server = buildServer(hub, VERSION);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp] request failed', error);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
});
const notAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
};
app.get('/mcp', bearer, notAllowed);
app.delete('/mcp', bearer, notAllowed);

const httpServer = app.listen(config.port, () => {
  console.log(`[relay] v${VERSION} listening on :${config.port}`);
  console.log(`[relay] MCP endpoint for Claude: ${mcpUrl}`);
  console.log(`[relay] WebSocket for Foundry:   ${new URL('/foundry', config.publicUrl).toString().replace(/^http/, 'ws')}`);
});
hub.attach(httpServer);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => httpServer.close(() => process.exit(0)));
}
