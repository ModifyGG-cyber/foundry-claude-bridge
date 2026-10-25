import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { CATALOG, systemOf, toolName, type CatalogEntry } from './catalog.js';
import type { FoundryHub } from './hub.js';
import schemas from './generated/schemas.json' with { type: 'json' };

const SCHEMAS = schemas as Record<string, Tool['inputSchema']>;

export const VERSION = '0.2.0';

const INSTRUCTIONS = `Tools for reading and changing a live Foundry VTT world through the GM's browser.
Start with get-world-info to learn the game system. Prefer ids from list/search results over guessing.
Changes are visible to players immediately. Tools marked destructive cannot be undone.
dnd5e-* and pf2e-* tools appear only when the world runs that system; in other systems (e.g. CoC7) read and change system data with get-actor / update-actor.`;

function toTool(entry: CatalogEntry): Tool {
  const schema = SCHEMAS[entry.command];
  if (!schema) throw new Error(`No generated schema for ${entry.command}; run npm run gen`);
  return {
    name: toolName(entry.command),
    description: entry.description,
    inputSchema: schema,
    annotations: {
      readOnlyHint: entry.kind === 'r',
      destructiveHint: entry.kind === 'd',
      openWorldHint: false,
    },
  };
}

const BY_NAME = new Map(CATALOG.map(entry => [toolName(entry.command), entry]));

/** Tools that make sense for the connected world. Before Foundry connects, list everything. */
export function availableTools(system?: string) {
  return CATALOG.filter(entry => {
    const needs = systemOf(entry.command);
    return !needs || !system || needs === system;
  }).map(toTool);
}

/** Pull screenshots out of a result so Claude receives them as images, not base64 text. */
function extractImages(data: unknown, images: { data: string; mimeType: string }[]): unknown {
  if (Array.isArray(data)) return data.map(d => extractImages(d, images));
  if (!data || typeof data !== 'object') return data;
  const obj = data as Record<string, unknown>;
  if (typeof obj.image === 'string' && typeof obj.mimeType === 'string' && obj.mimeType.startsWith('image/')) {
    images.push({ data: obj.image, mimeType: obj.mimeType });
    return { ...obj, image: `[attached as image ${images.length}]` };
  }
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, extractImages(v, images)]));
}

export function buildServer(hub: FoundryHub) {
  const server = new Server(
    { name: 'foundry-claude-bridge', version: VERSION },
    { capabilities: { tools: { listChanged: true } }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: availableTools(hub.world?.system) }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const entry = BY_NAME.get(request.params.name);
    if (!entry) return { isError: true, content: [{ type: 'text', text: `Unknown tool ${request.params.name}` }] };
    try {
      const images: { data: string; mimeType: string }[] = [];
      const data = extractImages(await hub.call(entry.command, request.params.arguments ?? {}), images);
      return {
        content: [
          { type: 'text', text: JSON.stringify(data, null, 1) },
          ...images.map(img => ({ type: 'image' as const, data: img.data, mimeType: img.mimeType })),
        ],
      };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: (error as Error).message }] };
    }
  });

  return server;
}
