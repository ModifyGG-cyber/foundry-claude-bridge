import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { Store } from './store.js';

const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const LOGIN_TTL_MS = 10 * 60 * 1000;
const API_KEY_CLIENT = 'static-api-key';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

function safeEqual(a: string, b: string) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
}

interface PendingLogin {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  expiresAt: number;
}

interface IssuedCode {
  clientId: string;
  params: AuthorizationParams;
  expiresAt: number;
}

/**
 * Single-user OAuth 2.1 authorization server. Anyone can register a client
 * (claude.ai uses dynamic client registration), but only someone who knows
 * RELAY_PASSWORD can approve it.
 */
export class SingleUserAuthProvider implements OAuthServerProvider {
  private pending = new Map<string, PendingLogin>();
  private codes = new Map<string, IssuedCode>();
  private failures: number[] = [];

  constructor(
    private store: Store,
    private password: string,
    private apiKey?: string,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: id => this.store.getClient(id),
      registerClient: client => {
        const full = client as OAuthClientInformationFull;
        this.store.putClient(full);
        return full;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    const requestId = newToken();
    this.pending.set(requestId, { client, params, expiresAt: Date.now() + LOGIN_TTL_MS });
    res.type('html').send(loginPage(requestId, client.client_name ?? client.client_id));
  }

  /** POST /login from the page rendered by authorize(). */
  handleLogin = (req: Request, res: Response) => {
    const requestId = String(req.body?.request ?? '');
    const login = this.pending.get(requestId);
    if (!login || login.expiresAt < Date.now()) {
      this.pending.delete(requestId);
      res.status(400).type('html').send(messagePage('This sign-in link has expired. Start the connection again from Claude.'));
      return;
    }

    const now = Date.now();
    this.failures = this.failures.filter(t => now - t < 15 * 60 * 1000);
    if (this.failures.length >= 10) {
      res.status(429).type('html').send(messagePage('Too many wrong passwords. Wait 15 minutes and try again.'));
      return;
    }

    if (req.body?.action === 'deny') {
      this.pending.delete(requestId);
      res.redirect(redirectWith(login.params, { error: 'access_denied' }));
      return;
    }

    if (!safeEqual(String(req.body?.password ?? ''), this.password)) {
      this.failures.push(now);
      res.status(401).type('html').send(loginPage(requestId, login.client.client_name ?? login.client.client_id, 'Wrong password.'));
      return;
    }

    this.pending.delete(requestId);
    const code = newToken();
    this.codes.set(code, { clientId: login.client.client_id, params: login.params, expiresAt: now + CODE_TTL_MS });
    res.redirect(redirectWith(login.params, { code }));
  };

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, code: string) {
    const issued = this.codes.get(code);
    if (!issued) throw new InvalidGrantError('Unknown authorization code');
    return issued.params.codeChallenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, code: string, _verifier?: string, redirectUri?: string): Promise<OAuthTokens> {
    const issued = this.codes.get(code);
    this.codes.delete(code);
    if (!issued || issued.expiresAt < Date.now()) throw new InvalidGrantError('Authorization code expired');
    if (issued.clientId !== client.client_id) throw new InvalidGrantError('Code was issued to another client');
    if (redirectUri && redirectUri !== issued.params.redirectUri) throw new InvalidGrantError('redirect_uri mismatch');
    return this.issue(client.client_id, issued.params.scopes ?? [], issued.params.resource?.toString());
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    const hash = sha256(refreshToken);
    const stored = this.store.getToken(hash);
    if (!stored || stored.kind !== 'refresh' || stored.clientId !== client.client_id || stored.expiresAt < Date.now()) {
      throw new InvalidGrantError('Invalid refresh token');
    }
    this.store.deleteToken(hash); // rotate
    return this.issue(client.client_id, scopes?.length ? scopes : stored.scopes, stored.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (this.apiKey && safeEqual(token, this.apiKey)) {
      return { token, clientId: API_KEY_CLIENT, scopes: [], expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    }
    const stored = this.store.getToken(sha256(token));
    if (!stored || stored.kind !== 'access' || stored.expiresAt < Date.now()) {
      throw new InvalidTokenError('Invalid or expired token');
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.expiresAt / 1000),
      resource: stored.resource ? new URL(stored.resource) : undefined,
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    this.store.deleteToken(sha256(request.token));
  }

  private issue(clientId: string, scopes: string[], resource?: string): OAuthTokens {
    const access = newToken();
    const refresh = newToken();
    const now = Date.now();
    this.store.putToken(sha256(access), { kind: 'access', clientId, scopes, expiresAt: now + ACCESS_TTL_MS, resource });
    this.store.putToken(sha256(refresh), { kind: 'refresh', clientId, scopes, expiresAt: now + REFRESH_TTL_MS, resource });
    return {
      access_token: access,
      token_type: 'bearer',
      expires_in: ACCESS_TTL_MS / 1000,
      refresh_token: refresh,
      scope: scopes.join(' '),
    };
  }
}

function redirectWith(params: AuthorizationParams, query: Record<string, string>) {
  const url = new URL(params.redirectUri);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (params.state !== undefined) url.searchParams.set('state', params.state);
  return url.toString();
}

const pageStyle = `body{font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;color:#222}
input{width:100%;padding:10px;margin:8px 0 16px;box-sizing:border-box;font-size:16px}
button{padding:10px 18px;font-size:15px;margin-right:8px;cursor:pointer}.err{color:#b00020}
@media (prefers-color-scheme:dark){body{background:#1b1b1b;color:#eee}}`;

function loginPage(requestId: string, clientName: string, error?: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Foundry bridge sign-in</title><style>${pageStyle}</style></head><body>
<h1>Foundry bridge</h1>
<p><strong>${escapeHtml(clientName)}</strong> wants to control your Foundry world.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/login">
<input type="hidden" name="request" value="${escapeHtml(requestId)}">
<label>Relay password<input type="password" name="password" autofocus autocomplete="current-password"></label>
<button type="submit" name="action" value="allow">Allow</button>
<button type="submit" name="action" value="deny" formnovalidate>Deny</button>
</form></body></html>`;
}

function messagePage(message: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Foundry bridge</title><style>${pageStyle}</style></head>
<body><h1>Foundry bridge</h1><p>${escapeHtml(message)}</p></body></html>`;
}
