import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

/** What the module reports about its world when it connects. */
export interface WorldInfo {
  id: string;
  title: string;
  system: string;
  systemVersion: string;
  foundryVersion: string;
  moduleVersion: string;
  gm: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

// Messages, see PROTOCOL.md
type Incoming =
  | { type: 'hello'; secret: string; world: WorldInfo }
  | { type: 'result'; id: string; ok: true; data: unknown }
  | { type: 'result'; id: string; ok: false; error: string };

export class FoundryError extends Error {}

function sameSecret(a: unknown, b: string) {
  if (typeof a !== 'string') return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Holds the one WebSocket opened by the GM's browser and turns tool calls
 * into request/response pairs over it.
 */
export class FoundryHub {
  private socket?: WebSocket;
  private pending = new Map<string, Pending>();
  world?: WorldInfo;
  connectedAt?: Date;

  constructor(private secret: string, private timeoutMs: number) {}

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  attach(server: Server, path = '/foundry') {
    const wss = new WebSocketServer({ server, path, maxPayload: 32 * 1024 * 1024 });
    wss.on('connection', ws => this.onConnection(ws));

    // Native ping frames; browsers answer them without any module code.
    const alive = new WeakMap<WebSocket, boolean>();
    wss.on('connection', ws => {
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));
    });
    const interval = setInterval(() => {
      for (const ws of wss.clients) {
        if (!alive.get(ws)) {
          ws.terminate();
          continue;
        }
        alive.set(ws, false);
        ws.ping();
      }
    }, 25_000);
    wss.on('close', () => clearInterval(interval));
  }

  async call(tool: string, args: unknown): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new FoundryError('Foundry is not connected. A GM needs to have the world open in a browser with the Claude Bridge module enabled.');
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new FoundryError(`Foundry did not answer "${tool}" within ${this.timeoutMs / 1000} seconds.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ type: 'call', id, tool, args: args ?? {} }));
    });
  }

  private onConnection(ws: WebSocket) {
    let authed = false;
    const helloTimer = setTimeout(() => ws.close(4000, 'hello timeout'), 10_000);

    ws.on('message', raw => {
      let msg: Incoming;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.close(4002, 'invalid json');
        return;
      }

      if (!authed) {
        if (msg.type !== 'hello' || !sameSecret(msg.secret, this.secret)) {
          console.warn('[hub] rejected a connection with a bad secret');
          ws.close(4001, 'unauthorized');
          return;
        }
        authed = true;
        clearTimeout(helloTimer);
        this.adopt(ws, msg.world);
        return;
      }

      if (msg.type === 'result') {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.ok) pending.resolve(msg.data);
        else pending.reject(new FoundryError(msg.error));
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (this.socket !== ws) return;
      console.log('[hub] Foundry disconnected');
      this.socket = undefined;
      this.failAll('Foundry disconnected before answering.');
    });
  }

  private adopt(ws: WebSocket, world: WorldInfo) {
    if (this.socket && this.socket !== ws) {
      this.socket.close(4003, 'replaced by a newer connection');
      this.failAll('Foundry reconnected before answering.');
    }
    this.socket = ws;
    this.world = world;
    this.connectedAt = new Date();
    ws.send(JSON.stringify({ type: 'welcome' }));
    console.log(`[hub] connected: "${world?.title}" (${world?.system}, Foundry ${world?.foundryVersion}) as ${world?.gm}`);
  }

  private failAll(reason: string) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new FoundryError(reason));
      this.pending.delete(id);
    }
  }
}
