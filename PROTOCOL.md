# Relay ↔ module protocol

The relay speaks the wire protocol of the Foundry API Bridge module (`module/`), documented in
`module/docs/COMMANDS.md`. Summary:

- The module opens `ws://<relay>/ws?apiKey=pk_…`. The relay closes with `4001` if the key doesn't match
  `FOUNDRY_KEY` (the module then stops retrying until settings change), and closes an older connection
  with `4002` when a newer one arrives (the old one retries after 2 minutes).
- Commands, relay → module: `{"id":"<uuid>","type":"get-actor","params":{"actorId":"…"}}`
- Responses, module → relay: `{"id":"<uuid>","success":true,"data":…}` or `{"id":"…","success":false,"error":"…"}`
- Heartbeat: the module sends `{"type":"ping","ts":…}`, the relay answers `{"type":"pong","ts":…}`.

On connect the relay calls `get-world-info` to learn the game system, then tells Claude the tool list
changed: `dnd5e-*` and `pf2e-*` tools are only offered in worlds of that system.

## Adding a tool

1. Add a handler in the module and register it in `module/src/main.ts`, with its params type in
   `module/src/commands/types.ts` (`CommandParamsMap`).
2. `cd relay && npm run gen` regenerates `src/generated/schemas.json` from those types.
3. Add one line to `relay/src/catalog.ts` with the description Claude sees.
