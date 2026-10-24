# Relay ↔ module protocol

One WebSocket at `wss://<relay>/foundry`, opened by the GM's browser. All frames are JSON text.

| Direction | Message | Notes |
| --- | --- | --- |
| module → relay | `{"type":"hello","secret":"…","world":{id,title,system,systemVersion,foundryVersion,moduleVersion,gm}}` | Must be the first frame, within 10 s. |
| relay → module | `{"type":"welcome"}` | Secret accepted. |
| relay → module | `{"type":"call","id":"<uuid>","tool":"actor-get","args":{…}}` | `args` are already validated against the tool's schema. |
| module → relay | `{"type":"result","id":"<uuid>","ok":true,"data":…}` | `data` is returned to Claude as JSON text. |
| module → relay | `{"type":"result","id":"<uuid>","ok":false,"error":"message"}` | Shown to Claude as a tool error. |

Close codes: `4000` no hello in time, `4001` bad secret (the module stops retrying), `4002` invalid JSON,
`4003` replaced by a newer connection from another GM browser. The relay sends WebSocket pings every 25 s.

Adding a tool means two edits: a schema in `relay/src/tools.ts` and a handler with the same name in
`module/scripts/handlers.js`.
