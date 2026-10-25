import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

// Wire protocol of the Foundry module, see module/docs/COMMANDS.md and PROTOCOL.md.
const CLOSE_KEY_REJECTED = 4001;
const CLOSE_REPLACED = 4002;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

type Incoming =
  | { type: 'ping'; ts?: number }
  | { id: string; success: true; data?: unknown }
  | { id: string; success: false; error?: string };

export interface WorldSummary {
  title?: string;
  system?: string;
  foundryVersion?: string;
}

export class FoundryError extends Error {}

function sameKey(a: string | null, b: string) {
  if (!a) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Accepts the one WebSocket opened by the GM's browser and turns tool calls
 * into command/response pairs over it.
 */
export class FoundryHub {
  private socket?: WebSocket;
  private pending = new Map<string, Pending>();
  private listeners = new Set<() => void>();
  world?: WorldSummary;
  connectedAt?: Date;
  private rememberedSystem?: string;

  /**
   * stateFile remembers the last world's game system, so that the tool list Claude reads before
   * Foundry connects already leaves out other systems' tools.
   */
  constructor(
    private key: string,
    private timeoutMs: number,
    private log: (msg: string) => void,
    private stateFile?: string,
  ) {
    if (!stateFile) return;
    try {
      const saved = JSON.parse(readFileSync(stateFile, 'utf8')) as { system?: unknown };
      if (typeof saved.system === 'string') this.rememberedSystem = saved.system;
    } catch {
      // No state yet.
    }
  }

  /** The connected world's system, or the last one seen while Foundry is offline. */
  get system(): string | undefined {
    return this.world?.system ?? this.rememberedSystem;
  }

  private rememberSystem(system: string) {
    this.rememberedSystem = system;
    if (!this.stateFile) return;
    try {
      mkdirSync(dirname(this.stateFile), { recursive: true });
      writeFileSync(this.stateFile, JSON.stringify({ system }));
    } catch (error) {
      this.log(`could not save ${this.stateFile}: ${(error as Error).message}`);
    }
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Called whenever Foundry connects or disconnects (the tool list may change). */
  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  attach(server: Server, path = '/ws') {
    const wss = new WebSocketServer({ server, path, maxPayload: 64 * 1024 * 1024 });
    wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  async call(command: string, params: unknown): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new FoundryError('Foundry is not connected. A GM needs the world open in a browser with the bridge module pointed at this relay.');
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new FoundryError(`Foundry did not answer "${command}" within ${this.timeoutMs / 1000} seconds.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, type: command, params: params ?? {} }));
    });
  }

  private onConnection(ws: WebSocket, req: IncomingMessage) {
    const key = new URL(req.url ?? '/', 'http://relay').searchParams.get('apiKey');
    if (!sameKey(key, this.key)) {
      this.log('rejected a Foundry connection with the wrong API key');
      ws.close(CLOSE_KEY_REJECTED, 'Invalid API key');
      return;
    }

    if (this.socket && this.socket !== ws) {
      this.socket.close(CLOSE_REPLACED, 'Replaced by a newer connection');
      this.failAll('Foundry reconnected before answering.');
    }
    this.socket = ws;
    this.connectedAt = new Date();

    ws.on('message', raw => {
      let msg: Incoming;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if ('type' in msg && msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
        return;
      }
      if (!('id' in msg)) return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.success) pending.resolve(msg.data ?? null);
      else pending.reject(new FoundryError(msg.error ?? 'Foundry reported an error without a message.'));
    });

    ws.on('close', () => {
      if (this.socket !== ws) return;
      this.socket = undefined;
      this.world = undefined;
      this.failAll('Foundry disconnected before answering.');
      this.log('Foundry disconnected');
      this.emit();
    });

    // Learn which system the world runs, so system-specific tools can be listed.
    this.call('get-world-info', {})
      .then(info => {
        const { world } = info as { world: { title: string; system: string; foundryVersion: string } };
        this.world = { title: world.title, system: world.system, foundryVersion: world.foundryVersion };
        if (world.system) this.rememberSystem(world.system);
        this.log(`Foundry connected: "${this.world.title}" (${this.world.system}, Foundry ${this.world.foundryVersion})`);
      })
      .catch(error => this.log(`Foundry connected, but get-world-info failed: ${(error as Error).message}`))
      .finally(() => this.emit());
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private failAll(reason: string) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new FoundryError(reason));
      this.pending.delete(id);
    }
  }
}
