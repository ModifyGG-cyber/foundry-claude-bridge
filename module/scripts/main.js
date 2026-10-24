import { handlers } from './handlers.js';

const MODULE_ID = 'claude-bridge';
const VERSION = '0.1.0';
const log = (...args) => console.log('Claude Bridge |', ...args);

const setting = key => game.settings.get(MODULE_ID, key);

Hooks.once('init', () => {
  // Client scope keeps the URL and secret in this GM's browser only; world
  // settings are readable by every connected player.
  game.settings.register(MODULE_ID, 'relayUrl', {
    name: 'Relay WebSocket URL',
    hint: 'For example wss://foundry-bridge.example.com/foundry. Stored only in this browser.',
    scope: 'client',
    config: true,
    type: String,
    default: '',
    onChange: () => bridge.restart(),
  });
  game.settings.register(MODULE_ID, 'secret', {
    name: 'Relay secret',
    hint: 'The FOUNDRY_SECRET value from the relay. Stored only in this browser.',
    scope: 'client',
    config: true,
    type: String,
    default: '',
    onChange: () => bridge.restart(),
  });
  game.settings.register(MODULE_ID, 'readOnly', {
    name: 'Read-only mode',
    hint: 'Claude can look but not change anything.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, 'disabledTools', {
    name: 'Disabled tools',
    hint: 'Comma-separated tool names Claude may not use, e.g. "chat-send, actor-update".',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: '',
  });
  game.settings.register(MODULE_ID, 'auditChanges', {
    name: 'Whisper changes to GM',
    hint: 'Post a GM-only chat note for every change Claude makes.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  });
});

Hooks.once('ready', () => {
  if (!game.user.isGM) return;
  bridge.restart();
});

// Only one GM browser should hold the connection: the one Foundry calls active.
// Re-check whenever someone joins or leaves, without dropping a working link.
Hooks.on('userConnected', () => {
  if (!game.user.isGM) return;
  const shouldHold = game.users.activeGM?.isSelf !== false;
  if (shouldHold && !bridge.socket && !bridge.retryTimer) bridge.restart();
  else if (!shouldHold && bridge.socket) bridge.stop();
});

class Bridge {
  socket = null;
  retryMs = 1000;
  retryTimer = null;
  warned = false;

  restart() {
    this.stop();
    if (!game.user.isGM || game.users.activeGM?.isSelf === false) return;
    const url = setting('relayUrl');
    const secret = setting('secret');
    if (!url || !secret) {
      log('relay URL or secret not set; staying offline');
      return;
    }
    this.connect(url, secret);
  }

  stop() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  connect(url, secret) {
    const ws = new WebSocket(url);
    this.socket = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'hello',
        secret,
        world: {
          id: game.world.id,
          title: game.world.title,
          system: game.system.id,
          systemVersion: game.system.version,
          foundryVersion: game.version,
          moduleVersion: VERSION,
          gm: game.user.name,
        },
      }));
    };

    ws.onmessage = event => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        this.retryMs = 1000;
        this.warned = false;
        log('connected to relay');
        ui.notifications.info('Claude Bridge connected.');
      } else if (msg.type === 'call') {
        this.handle(ws, msg);
      }
    };

    ws.onclose = event => {
      this.socket = null;
      if (event.code === 4001) {
        ui.notifications.error('Claude Bridge: the relay rejected the secret. Check the module settings.');
        return; // retrying with the same secret is pointless
      }
      if (event.code === 4003) {
        log('another GM connection took over');
        return;
      }
      if (!this.warned) {
        ui.notifications.warn('Claude Bridge lost its relay connection; retrying in the background.');
        this.warned = true;
      }
      this.retryTimer = setTimeout(() => this.connect(url, secret), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 30_000);
    };
  }

  async handle(ws, { id, tool, args }) {
    const reply = body => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id, ...body }));
    };
    const handler = handlers[tool];
    try {
      if (!handler) throw new Error(`This version of the Claude Bridge module has no "${tool}" tool.`);
      const disabled = setting('disabledTools').split(',').map(s => s.trim()).filter(Boolean);
      if (disabled.includes(tool)) throw new Error(`The GM has disabled "${tool}".`);
      if (handler.write && setting('readOnly')) throw new Error('The GM has put Claude Bridge in read-only mode.');

      const result = await handler.run(args ?? {});
      if (handler.write && handler.audit && setting('auditChanges')) await audit(tool, handler.audit(args, result));
      reply({ ok: true, data: result ?? null });
    } catch (error) {
      console.error('Claude Bridge |', tool, error);
      reply({ ok: false, error: error?.message ?? String(error) });
    }
  }
}

async function audit(tool, summary) {
  await ChatMessage.implementation.create({
    content: `<p><strong>Claude</strong> used <code>${tool}</code>: ${foundry.utils.escapeHTML(summary)}</p>`,
    whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id),
    speaker: { alias: 'Claude Bridge' },
  });
}

const bridge = new Bridge();
