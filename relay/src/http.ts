import express from 'express';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SingleUserAuthProvider } from './auth.js';
import type { HttpConfig } from './config.js';
import type { FoundryHub } from './hub.js';
import { buildServer } from './mcp.js';
import { Store } from './store.js';

/** Remote mode: MCP over Streamable HTTP with OAuth, for claude.ai or a relay on another machine. */
export function mountHttpMcp(app: express.Express, hub: FoundryHub, config: HttpConfig) {
  const store = new Store(config.dataDir);
  const provider = new SingleUserAuthProvider(store, config.password, config.apiKey);
  const mcpUrl = new URL('/mcp', config.publicUrl);

  app.set('trust proxy', 1);
  app.use(mcpAuthRouter({ provider, issuerUrl: config.publicUrl, resourceServerUrl: mcpUrl, resourceName: 'Foundry bridge' }));
  app.post('/login', express.urlencoded({ extended: false, limit: '8kb' }), provider.handleLogin);

  const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) });

  // Stateless: a fresh MCP server per request, all sharing one hub.
  app.post('/mcp', bearer, express.json({ limit: '4mb' }), async (req, res) => {
    const server = buildServer(hub);
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
  return mcpUrl;
}
