import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { CATALOG, systemOf, toolName, type CatalogEntry } from './catalog.js';
import { HANDOUT_TEMPLATES, getHandoutTemplate, listHandoutTemplates } from './handouts.js';
import type { FoundryHub } from './hub.js';
import schemas from './generated/schemas.json' with { type: 'json' };

const SCHEMAS = schemas as Record<string, Tool['inputSchema']>;

export const VERSION = '0.2.2';

const INSTRUCTIONS = `Tools for reading and changing a live Foundry VTT world through the GM's browser.
Start with get-world-info to learn the game system. Prefer ids from list/search results over guessing.
Changes are visible to players immediately. Tools marked destructive cannot be undone.
dnd5e-*, pf2e-* and coc7-* tools appear only when the world runs that system.
For player handouts (letters, telegrams, clippings, notices) start from handout-template-list rather than writing the layout from scratch.
Positions (x, y) are canvas pixels, which include the scene padding: get-scene's mapArea says where the map starts. A grid cell is canvas pixel / grid size, as in the ASCII map and capture-scene labels. In CoC7 worlds prefer coc7-roll-check over roll-dice, and coc7-request-roll when a player should roll.`;

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

/** Tools the relay answers itself, without a round trip to Foundry. */
interface LocalTool {
  tool: Tool;
  run(args: Record<string, unknown>): unknown;
}

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const LOCAL_TOOLS: LocalTool[] = [
  {
    tool: {
      name: 'handout-template-list',
      description:
        'List ready-made player handout layouts (telegram, newspaper clipping, letter, diary, police report, occult tome, ' +
        'wanted poster, royal decree and more). setting narrows to 1920s or fantasy. Read one with handout-template-get.',
      inputSchema: {
        type: 'object',
        properties: { setting: { type: 'string', enum: ['1920s', 'fantasy'] } },
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    run: args => listHandoutTemplates(typeof args.setting === 'string' ? args.setting : undefined),
  },
  {
    tool: {
      name: 'handout-template-get',
      description:
        'Full HTML of one handout template. Rewrite its sample text with your own, then save it with create-journal or ' +
        'create-journal-page and show it with show-journal.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', enum: HANDOUT_TEMPLATES.map(t => t.id) } },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    run: args => getHandoutTemplate(String(args.id)),
  },
];

const LOCAL_BY_NAME = new Map(LOCAL_TOOLS.map(local => [local.tool.name, local]));

/** Tools that make sense for the connected world. Before Foundry connects, list everything. */
export function availableTools(system?: string) {
  return CATALOG.filter(entry => {
    const needs = systemOf(entry.command);
    return !needs || !system || needs === system.toLowerCase();
  }).map(toTool).concat(LOCAL_TOOLS.map(local => local.tool));
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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: availableTools(hub.system) }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const local = LOCAL_BY_NAME.get(request.params.name);
    if (local) {
      try {
        return { content: [{ type: 'text', text: JSON.stringify(local.run(request.params.arguments ?? {}), null, 1) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: (error as Error).message }] };
      }
    }
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
