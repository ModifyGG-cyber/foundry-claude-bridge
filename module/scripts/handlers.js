/**
 * One handler per MCP tool. Each has run(args) returning JSON-safe data,
 * write: true if it changes the world, and optionally audit(args, result)
 * returning a one-line summary for the GM's audit whisper.
 */

const lower = s => String(s ?? '').toLocaleLowerCase();

/** Find a document in a world collection by id, then exact name, then case-insensitive name. */
function find(collection, { id, name }, label) {
  let doc = id ? collection.get(id) : null;
  if (!doc && name) doc = collection.getName(name) ?? collection.find(d => lower(d.name) === lower(name));
  if (!doc) throw new Error(`No ${label} found with ${id ? `id "${id}"` : `name "${name}"`}.`);
  return doc;
}

const BLOCK_END = /<\/(p|div|h[1-6]|li|tr|blockquote|section|table)>|<br\s*\/?>/gi;

/** Journal HTML to readable plain text, without loading any images. */
function htmlToText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html.replace(BLOCK_END, '$&\n')}</body></html>`, 'text/html');
  return doc.body.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function snippet(text, index, length) {
  const start = Math.max(0, index - 120);
  const end = Math.min(text.length, index + length + 120);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
}

export const handlers = {
  'world-info': {
    run() {
      const scene = game.scenes.active;
      return {
        world: { id: game.world.id, title: game.world.title },
        system: { id: game.system.id, title: game.system.title, version: game.system.version },
        foundryVersion: game.version,
        paused: game.paused,
        activeScene: scene ? { id: scene.id, name: scene.name } : null,
        counts: {
          actors: game.actors.size,
          items: game.items.size,
          journals: game.journal.size,
          scenes: game.scenes.size,
          rollTables: game.tables.size,
          playlists: game.playlists.size,
          macros: game.macros.size,
        },
        users: game.users.map(u => ({ id: u.id, name: u.name, isGM: u.isGM, active: u.active, character: u.character?.name ?? null })),
        compendiums: game.packs.map(p => ({ id: p.collection, label: p.metadata.label, type: p.documentName, count: p.index.size })),
      };
    },
  },

  'actor-list': {
    run({ type, name, folder, limit = 50, offset = 0 }) {
      let actors = game.actors.contents;
      if (type) actors = actors.filter(a => a.type === type);
      if (name) actors = actors.filter(a => lower(a.name).includes(lower(name)));
      if (folder) actors = actors.filter(a => lower(a.folder?.name) === lower(folder));
      actors.sort((a, b) => a.name.localeCompare(b.name));
      return {
        total: actors.length,
        offset,
        actors: actors.slice(offset, offset + limit).map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          folder: a.folder?.name ?? null,
          playerOwned: a.hasPlayerOwner,
        })),
      };
    },
  },

  'actor-get': {
    run({ id, name, includeItemData = false }) {
      const actor = find(game.actors, { id, name }, 'actor');
      const data = actor.toObject(false); // false = include derived values
      return {
        id: actor.id,
        uuid: actor.uuid,
        name: actor.name,
        type: actor.type,
        img: actor.img,
        folder: actor.folder?.name ?? null,
        playerOwned: actor.hasPlayerOwner,
        system: data.system,
        items: actor.items.map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
          ...(includeItemData ? { system: i.toObject(false).system } : {}),
        })),
        effects: actor.effects.map(e => ({ id: e.id, name: e.name, disabled: e.disabled, statuses: [...(e.statuses ?? [])] })),
      };
    },
  },

  'journal-search': {
    run({ query, searchContent = true, folder, limit = 20 }) {
      const terms = lower(query).split(/\s+/).filter(Boolean);
      const matchesAll = text => terms.every(t => text.includes(t));
      const results = [];

      for (const entry of game.journal) {
        if (results.length >= limit) break;
        if (folder && lower(entry.folder?.name) !== lower(folder)) continue;
        const entryName = lower(entry.name);
        if (matchesAll(entryName)) {
          results.push({ entryId: entry.id, entryName: entry.name, folder: entry.folder?.name ?? null, matched: 'name', pages: entry.pages.size });
          continue;
        }
        if (!searchContent) continue;
        for (const page of entry.pages) {
          if (results.length >= limit) break;
          if (page.type !== 'text') continue;
          const text = htmlToText(page.text?.content);
          const haystack = lower(`${page.name}\n${text}`);
          if (!matchesAll(haystack)) continue;
          const at = lower(text).indexOf(terms[0]);
          results.push({
            entryId: entry.id,
            entryName: entry.name,
            pageId: page.id,
            pageName: page.name,
            folder: entry.folder?.name ?? null,
            matched: 'content',
            snippet: at >= 0 ? snippet(text, at, terms[0].length) : text.slice(0, 240),
          });
        }
      }
      return { query, count: results.length, truncated: results.length >= limit, results };
    },
  },

  'journal-get': {
    run({ id, name, pageId, pageName, maxChars = 20000, offset = 0 }) {
      const entry = find(game.journal, { id, name }, 'journal entry');
      let pages = entry.pages.contents.sort((a, b) => a.sort - b.sort);
      if (pageId || pageName) pages = [find(entry.pages, { id: pageId, name: pageName }, 'page')];

      // Lay the pages out as one text stream so offset/maxChars page through it.
      const all = pages.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        text: p.type === 'text' ? htmlToText(p.text?.content) : '',
        src: p.src ?? null,
      }));
      let pos = 0;
      let budget = maxChars;
      const out = [];
      for (const page of all) {
        const len = page.text.length;
        const pageStart = pos;
        pos += len;
        // Skip pages wholly before the offset; image pages belong to the chunk they start in.
        if (len > 0 ? pos <= offset : pageStart < offset) continue;
        if (budget <= 0) break;
        const start = Math.max(0, offset - pageStart);
        const text = page.text.slice(start, start + budget);
        budget -= text.length;
        out.push({ ...page, text, ...(start > 0 ? { startsAt: start } : {}) });
      }
      const total = all.reduce((n, p) => n + p.text.length, 0);
      const nextOffset = offset + (maxChars - budget);
      return {
        id: entry.id,
        uuid: entry.uuid,
        name: entry.name,
        folder: entry.folder?.name ?? null,
        pageCount: entry.pages.size,
        totalChars: total,
        pages: out,
        ...(nextOffset < total ? { truncated: true, nextOffset } : {}),
      };
    },
  },

  'chat-send': {
    write: true,
    async run({ content, speakerActorId, speakerActorName, alias, whisperToGM = false }) {
      let speaker = { alias: alias ?? 'Claude' };
      if (speakerActorId || speakerActorName) {
        const actor = find(game.actors, { id: speakerActorId, name: speakerActorName }, 'actor');
        speaker = ChatMessage.getSpeaker({ actor });
        if (alias) speaker.alias = alias;
      }
      const message = await ChatMessage.implementation.create({
        content,
        speaker,
        whisper: whisperToGM ? ChatMessage.getWhisperRecipients('GM').map(u => u.id) : [],
      });
      return { id: message.id, speaker: speaker.alias ?? message.alias, whispered: whisperToGM };
    },
  },
};
