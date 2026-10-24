# Foundry–Claude bridge

Connects Claude (claude.ai, the Claude apps, Claude Code) to a Foundry VTT world without any third-party service.

```
Claude ──HTTPS + OAuth──▶ relay (/mcp)  ◀──WSS, opened by the browser── Claude Bridge module (GM's browser) ──▶ your world
```

- `relay/`: Node/TypeScript service. A remote MCP server for Claude on `/mcp` and a WebSocket hub for Foundry on `/foundry`.
- `module/`: the Foundry module (`claude-bridge`), Foundry v13 and v14. Runs only in a GM's browser.

A GM must have the world open in a browser tab for Claude to reach it.

## Tools (v0.1)

| Tool | What it does |
| --- | --- |
| `world-info` | System, version, counts, active scene, users, compendiums |
| `actor-list` | Filter actors by type, name, folder |
| `actor-get` | Full sheet data, items and effects for one actor |
| `journal-search` | Search entry names and page text |
| `journal-get` | Read an entry's pages as plain text, paged |
| `chat-send` | Post to chat as an actor or alias, optionally whispered to GMs |

## 1. Run the relay

It needs a public HTTPS address because claude.ai connects from Anthropic's cloud.

```sh
cd relay
cp .env.example .env      # fill in PUBLIC_URL, FOUNDRY_SECRET, RELAY_PASSWORD
docker compose -f ../docker-compose.yml up -d --build
curl https://<your relay>/health
```

Without Docker: `npm ci && npm run build && npm start` with the same variables set.

Ways to give it HTTPS:

- **VPS:** a Caddy site block `foundry-bridge.example.com { reverse_proxy 127.0.0.1:8787 }`. Caddy handles certificates and WebSockets.
- **Home PC:** `cloudflared tunnel --url http://localhost:8787` for a quick test, or a named tunnel for a permanent hostname.
- **The Forge / Molten:** run the relay on a small cloud instance (Fly.io, Railway, Render) since you can't add services next to Foundry.

## 2. Install the module

Copy `module/` into your Foundry data folder as `Data/modules/claude-bridge`, restart Foundry, and enable **Claude Bridge** in the world.
As GM, open **Configure Settings → Claude Bridge** and set:

- **Relay WebSocket URL:** `wss://<your relay>/foundry`
- **Relay secret:** the `FOUNDRY_SECRET` value

These two are stored only in that browser. You should see "Claude Bridge connected." `/health` then shows your world.

Also in settings: read-only mode, a list of disabled tools, and GM whispers for every change Claude makes.

## 3. Connect Claude

- **claude.ai and the apps:** Settings → Connectors → Add custom connector, URL `https://<your relay>/mcp`. Sign in with `RELAY_PASSWORD` when asked.
- **Claude Code:** `claude mcp add --transport http foundry https://<your relay>/mcp --header "Authorization: Bearer $API_KEY"` (set `API_KEY` on the relay first).

Then ask something like "Using Foundry, who are the investigators and what are their sanity scores?"

## Development

`cd relay && npm test` builds the relay and runs an end-to-end test: the real relay, the real module handlers against a fake Foundry, an MCP client, and the full OAuth flow.

See `PROTOCOL.md` for the wire format and how to add a tool.
