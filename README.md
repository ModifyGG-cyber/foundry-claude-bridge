# Foundry–Claude bridge

Connects Claude to a Foundry VTT world with no subscription and no third-party server.

```
Claude Desktop ──stdio──▶ relay (on your PC) ◀──ws://localhost:8787/ws── bridge module (GM's browser) ──▶ your world
```

- `relay/`: a small Node service. Claude Desktop starts it as a local MCP server, and the Foundry
  module connects to it over a WebSocket. It can also run as a remote server for claude.ai (`--http`).
- `module/`: the Foundry module, a fork of the MIT-licensed
  [Foundry API Bridge](https://github.com/alexivenkov/foundry-api-bridge-module) 8.15.0 (see `NOTICE.md`).
  Foundry v11–v14. Runs only in a GM's browser.

Claude gets 158 tools: actors, items, inventory, effects, folders, journals, roll tables, macros,
playlists, scenes, walls and doors, map notes, tokens (with pathfinding), combat, compendiums, chat,
dice, world time, and UI, plus D&D 5e and Pathfinder 2e tools in worlds of those systems.

A GM must have the world open in a browser tab for Claude to reach it.

## Setup for Claude Desktop with Foundry on the same PC

You need Node.js 20 or newer.

1. **Build the relay and make a key**

   ```sh
   cd relay
   npm ci
   npm run build
   node dist/index.js --new-key      # prints pk_…; keep it for steps 2 and 3
   ```

2. **Point the Foundry module at it.** With the module installed and enabled in your world, open
   **Configure Settings → Foundry API Bridge** as GM and set:
   - **MCP WebSocket URL:** `ws://localhost:8787/ws`
   - **API WebSocket URL:** empty (that channel is the original author's REST service)
   - **API Key:** the `pk_…` key from step 1

   Reload the world. If you already run the original module, these settings are all you need to switch it
   over. To install this fork instead, build it with `cd module && npm ci && npm run build` and copy
   `module/dist` to `Data/modules/foundry-api-bridge`.

3. **Add the relay to Claude Desktop.** Open Settings → Developer → Edit Config, and add the following
   to `claude_desktop_config.json` (use the full path to your clone):

   ```json
   {
     "mcpServers": {
       "foundry": {
         "command": "node",
         "args": ["C:\\path\\to\\foundry-claude-bridge\\relay\\dist\\index.js"],
         "env": { "FOUNDRY_KEY": "pk_…" }
       }
     }
   }
   ```

   Restart Claude Desktop. The relay starts with it, and Foundry shows "[MCP] Connected to server"
   within a few seconds. `http://localhost:8787/health` shows whether the world is connected.

Then ask something like "Using Foundry, list the investigators and their sanity."

## Remote mode (claude.ai, or Foundry on another machine)

`node dist/index.js --http` serves MCP on `/mcp` with a password-protected OAuth sign-in, which is what
claude.ai custom connectors expect. It needs a public HTTPS address (Caddy, nginx or a Cloudflare
Tunnel in front), and `PUBLIC_URL` and `RELAY_PASSWORD` set; see `relay/.env.example` and
`docker-compose.yml`. The module's URL then becomes `wss://<your host>/ws`.

## Development

`cd relay && npm test` builds the relay and runs end-to-end tests over stdio and HTTP against a fake
module, covering the wire protocol, tool listing per system, images, timeouts and OAuth.

See `PROTOCOL.md` for the wire format and how to add a tool.
