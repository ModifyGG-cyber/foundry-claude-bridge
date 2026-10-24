// A minimal stand-in for the Foundry client globals the module's handlers use.
import { DOMParser } from 'linkedom';

class Collection extends Map {
  constructor(docs = []) {
    super(docs.map(d => [d.id, d]));
  }
  get contents() { return [...this.values()]; }
  getName(name) { return this.contents.find(d => d.name === name); }
  find(fn) { return this.contents.find(fn); }
  filter(fn) { return this.contents.filter(fn); }
  map(fn) { return this.contents.map(fn); }
  [Symbol.iterator]() { return this.values(); }
}

const doc = (fields, system = {}) => ({
  ...fields,
  uuid: `Actor.${fields.id}`,
  system,
  toObject: () => ({ system: structuredClone(system) }),
});

export const chat = [];

export function install() {
  const folder = { name: 'Investigators' };
  const items = new Collection([doc({ id: 'i1', name: 'Spot Hidden', type: 'skill' }, { value: 60 })]);
  const actors = new Collection([
    { ...doc({ id: 'a1', name: 'Jackson Elias', type: 'npc', folder: null, hasPlayerOwner: false }, { attribs: { hp: { value: 12 } } }), items: new Collection(), effects: new Collection() },
    { ...doc({ id: 'a2', name: 'Harvey Walters', type: 'character', folder, hasPlayerOwner: true }, { characteristics: { int: { value: 85 } } }), items, effects: new Collection() },
  ]);
  const page = (id, name, html, sort) => ({ id, name, type: 'text', sort, text: { content: html } });
  const journal = new Collection([
    { id: 'j1', uuid: 'JournalEntry.j1', name: 'Peru Handouts', folder: null, pages: new Collection([
      page('p1', 'Handout 1', '<p>Telegram from <b>Jackson Elias</b>.</p><p>Come to New York at once.</p>', 1),
      { id: 'p2', name: 'Map', type: 'image', sort: 2, src: 'maps/peru.webp' },
    ]) },
    { id: 'j2', uuid: 'JournalEntry.j2', name: 'Ju-Ju House', folder: { name: 'New York' }, pages: new Collection([
      page('p3', 'Overview', '<h2>Ju-Ju House</h2><p>Silas N\'Kwane keeps the shop.</p>' + '<p>filler text about the shop</p>'.repeat(60), 1),
    ]) },
  ]);

  globalThis.DOMParser = DOMParser;
  globalThis.game = {
    world: { id: 'nyarlathotep', title: 'Nyarlathotep' },
    system: { id: 'CoC7', title: 'Call of Cthulhu 7th Edition', version: '8.16' },
    version: '14.369',
    paused: false,
    user: { name: 'Gamemaster', isGM: true },
    actors,
    items,
    journal,
    scenes: Object.assign(new Collection([{ id: 's1', name: 'Arkham' }]), { active: { id: 's1', name: 'Arkham' } }),
    tables: new Collection(),
    playlists: new Collection(),
    macros: new Collection(),
    users: new Collection([{ id: 'u1', name: 'Gamemaster', isGM: true, active: true, character: null }]),
    packs: new Collection([{ collection: 'CoC7.skills', metadata: { label: 'Skills' }, documentName: 'Item', index: { size: 103 } }]),
  };
  globalThis.ChatMessage = {
    getSpeaker: ({ actor }) => ({ actor: actor.id, alias: actor.name }),
    getWhisperRecipients: () => [{ id: 'u1' }],
    implementation: { create: async data => { chat.push(data); return { id: `m${chat.length}` }; } },
  };
}
