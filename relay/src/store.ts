import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

export interface StoredToken {
  kind: 'access' | 'refresh';
  clientId: string;
  scopes: string[];
  expiresAt: number; // ms since epoch
  resource?: string;
}

interface State {
  clients: Record<string, OAuthClientInformationFull>;
  tokens: Record<string, StoredToken>; // keyed by sha256 of the token
}

/** Tiny JSON-file store so claude.ai stays signed in across relay restarts. */
export class Store {
  private state: State = { clients: {}, tokens: {} };
  private readonly file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'state.json');
    try {
      this.state = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      this.save();
    }
    this.prune();
  }

  getClient(id: string) {
    return this.state.clients[id];
  }

  putClient(client: OAuthClientInformationFull) {
    this.state.clients[client.client_id] = client;
    this.save();
  }

  getToken(hash: string) {
    return this.state.tokens[hash];
  }

  putToken(hash: string, token: StoredToken) {
    this.state.tokens[hash] = token;
    this.save();
  }

  deleteToken(hash: string) {
    delete this.state.tokens[hash];
    this.save();
  }

  private prune() {
    const now = Date.now();
    for (const [hash, token] of Object.entries(this.state.tokens)) {
      if (token.expiresAt < now) delete this.state.tokens[hash];
    }
    this.save();
  }

  private save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
