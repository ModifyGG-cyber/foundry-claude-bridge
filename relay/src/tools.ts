import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { FoundryHub } from './hub.js';

interface ToolDef {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  annotations: ToolAnnotations;
}

const read: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const write: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const lookup = {
  id: z.string().optional().describe('Document id. Preferred when known.'),
  name: z.string().optional().describe('Exact or case-insensitive name, used when no id is given.'),
};

/**
 * Every tool is a thin schema here; the work happens in the Foundry module's
 * handler of the same name. Keep names in sync with module/scripts/handlers.js.
 */
export const TOOLS: ToolDef[] = [
  {
    name: 'world-info',
    title: 'World overview',
    description:
      'Overview of the connected Foundry world: title, game system and version, document counts, active scene, users online, and compendium packs. Call this first in a session.',
    input: {},
    annotations: read,
  },
  {
    name: 'actor-list',
    title: 'List actors',
    description: 'List actors in the world, optionally filtered by type, name substring, or folder name. Returns ids, names, types, and folders.',
    input: {
      type: z.string().optional().describe('Actor type, e.g. "character", "npc", "creature", "container" in CoC7.'),
      name: z.string().optional().describe('Case-insensitive substring of the actor name.'),
      folder: z.string().optional().describe('Case-insensitive folder name.'),
      limit: z.number().int().min(1).max(500).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: read,
  },
  {
    name: 'actor-get',
    title: 'Get actor',
    description:
      "Get one actor's full sheet data (system data with derived values), its items (skills, weapons, spells, etc.), and active effects. Set includeItemData to also return each item's system data.",
    input: {
      ...lookup,
      includeItemData: z.boolean().default(false),
    },
    annotations: read,
  },
  {
    name: 'journal-search',
    title: 'Search journals',
    description:
      'Search journal entries by name and by the text of their pages. All words in the query must appear. Returns matching entries and pages with a short snippet around the first match.',
    input: {
      query: z.string().min(1),
      searchContent: z.boolean().default(true).describe('Also search page text, not just names.'),
      folder: z.string().optional().describe('Only search entries in this folder (case-insensitive name).'),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: read,
  },
  {
    name: 'journal-get',
    title: 'Read journal',
    description:
      'Read a journal entry and its pages as plain text (links like @UUID[...] are kept). Optionally limit to one page by id or name. Long text is cut at maxChars; use offset to continue.',
    input: {
      ...lookup,
      pageId: z.string().optional(),
      pageName: z.string().optional(),
      maxChars: z.number().int().min(500).max(100_000).default(20_000),
      offset: z.number().int().min(0).default(0),
    },
    annotations: read,
  },
  {
    name: 'chat-send',
    title: 'Send chat message',
    description:
      'Post a message to Foundry chat. Content may contain simple HTML. Speak as an actor by id or name, or with a custom alias. Set whisperToGM to make it visible only to GMs.',
    input: {
      content: z.string().min(1),
      speakerActorId: z.string().optional(),
      speakerActorName: z.string().optional(),
      alias: z.string().optional().describe('Display name to speak as, if not an actor.'),
      whisperToGM: z.boolean().default(false),
    },
    annotations: write,
  },
];

export function buildServer(hub: FoundryHub, version: string) {
  const server = new McpServer(
    { name: 'foundry-claude-bridge', version },
    {
      instructions:
        'Tools for reading and changing a live Foundry VTT world. Start with world-info to learn the game system and what exists. Prefer ids from list/search results over names. Changes are visible to players immediately.',
    },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: tool.annotations },
      async (args: unknown) => {
        try {
          const data = await hub.call(tool.name, args);
          return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] };
        } catch (error) {
          return { isError: true, content: [{ type: 'text' as const, text: (error as Error).message }] };
        }
      },
    );
  }
  return server;
}
