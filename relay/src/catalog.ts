/**
 * MCP tools exposed by the relay. Each maps onto one wire command of the
 * Foundry module (see module/docs/COMMANDS.md); input schemas are generated
 * from the module's TypeScript parameter types into generated/schemas.json.
 *
 * kind: r = read only, w = changes the world, d = deletes or cannot be undone.
 * Tools whose command starts with "dnd5e/" or "pf2e/" are only listed when the
 * connected world runs that system.
 */
export type Kind = 'r' | 'w' | 'd';

export interface CatalogEntry {
  command: string;
  kind: Kind;
  description: string;
}

const e = (command: string, kind: Kind, description: string): CatalogEntry => ({ command, kind, description });

export const CATALOG: CatalogEntry[] = [
  // World, time, UI
  e('get-world-info', 'r', 'Overview of the connected world: title, game system and version, Foundry version, document counts and compendium packs. Call first in a session.'),
  e('get-world-time', 'r', 'Current in-world clock in seconds.'),
  e('advance-time', 'w', 'Move the world clock by a number of seconds (negative rewinds). 6 = a combat round, 3600 = an hour, 86400 = a day.'),
  e('set-world-time', 'w', 'Set the world clock to an absolute number of seconds.'),
  e('get-pause-state', 'r', 'Whether the game is paused.'),
  e('pause-game', 'w', 'Pause the game for everyone.'),
  e('resume-game', 'w', 'Unpause the game.'),
  e('notify', 'w', 'Show a toast notification on every client. type is info, warning or error.'),
  e('pan-canvas', 'w', 'Pan and/or zoom every client\'s canvas to scene-pixel x, y and scale.'),
  e('ping-location', 'w', 'Drop a ping marker at scene-pixel x, y that all players see.'),

  // Dice, chat
  e('roll-dice', 'w', 'Roll any Foundry dice formula ("1d100", "4d6kh3", "2d20kl1"). showInChat posts the roll; flavor labels it.'),
  e('send-chat-message', 'w', 'Post to chat: narration, NPC speech (actorId shows their portrait), out-of-character notes. HTML allowed; @UUID[Actor.id]{Name} makes links. whisperTo is a list of user ids.'),
  e('get-chat-messages', 'r', 'Read recent chat messages, filtered by text search, speaker actor, author, type, or time window.'),
  e('update-chat-message', 'w', 'Edit the content or flavor of a chat message.'),
  e('delete-chat-message', 'd', 'Delete one chat message by id.'),
  e('clear-chat', 'd', 'Delete the ENTIRE chat log. Only when the user explicitly asks.'),
  e('export-chat', 'r', 'Whole chat log as readable text or JSON, for recaps and session summaries.'),

  // Actors
  e('get-actors', 'r', 'List every world actor with id, name and type.'),
  e('filter-actors', 'r', 'Search world actors by name, folder, type, player ownership, HP, plus dnd5e fields such as CR, creature type, size, AC and abilities. Paginated.'),
  e('get-actor', 'r', 'Full data for one actor: system data, items and effects.'),
  e('create-actor', 'w', 'Create an actor. type must be valid for the world\'s system (dnd5e: character, npc, vehicle, group; CoC7: character, npc, creature, container). system is merged over defaults.'),
  e('create-actor-from-compendium', 'w', 'Import an actor from a compendium pack into the world.'),
  e('update-actor', 'w', 'Change an actor\'s name, image, folder or system data (deep-merged: pass only changed paths). Pass tokenId instead of actorId to change one unlinked token\'s copy.'),
  e('delete-actor', 'd', 'Delete a world actor permanently.'),

  // World items
  e('get-items', 'r', 'List items in the world Items directory.'),
  e('filter-items', 'r', 'Search world items by name, folder, type, plus dnd5e fields such as rarity, price, weight and spell level. Paginated.'),
  e('get-item', 'r', 'Full data for one world item.'),
  e('create-item', 'w', 'Create an item in the world Items directory (not on an actor).'),
  e('create-item-from-compendium', 'w', 'Import an item from a compendium pack into the world Items directory.'),
  e('update-item', 'w', 'Change a world item\'s name, image, folder or system data (deep-merged).'),
  e('delete-item', 'd', 'Delete a world item permanently.'),

  // Actor inventory
  e('get-actor-items', 'r', 'An actor\'s items (skills, weapons, spells, gear, features), filterable by type and equipped state. Item ids feed the roll and use tools.'),
  e('add-item-to-actor', 'w', 'Create a new item directly on an actor.'),
  e('add-item-from-compendium', 'w', 'Copy an item from a compendium pack onto an actor.'),
  e('update-actor-item', 'w', 'Change an item on an actor (deep-merged system data), e.g. quantity or uses.'),
  e('delete-actor-item', 'd', 'Remove an item from an actor permanently.'),

  // Effects
  e('get-actor-effects', 'r', 'Active effects and conditions on an actor, or on one token via tokenId.'),
  e('add-actor-effect', 'w', 'Add an active effect with data-path changes, statuses and duration to an actor or one token.'),
  e('update-actor-effect', 'w', 'Change an existing active effect.'),
  e('remove-actor-effect', 'd', 'Remove an active effect.'),
  e('toggle-actor-status', 'w', 'Turn a status condition (prone, unconscious, ...) on or off for an actor or one token.'),

  // Folders
  e('get-folders', 'r', 'List folders, optionally only those of one document type.'),
  e('get-folder', 'r', 'One folder, optionally with its contents and subfolders.'),
  e('create-folder', 'w', 'Create a folder for a document type (Actor, Item, Scene, JournalEntry, RollTable, Macro, Playlist, ...).'),
  e('update-folder', 'w', 'Rename, recolour or move a folder.'),
  e('delete-folder', 'd', 'Delete a folder, optionally with its contents and subfolders.'),

  // Journals
  e('get-journals', 'r', 'List journal entries. light: true returns an index without page text, much faster on big worlds.'),
  e('get-journal', 'r', 'One journal entry with all its pages and their content.'),
  e('create-journal', 'w', 'Create a journal entry, optionally with a first page of HTML content.'),
  e('update-journal', 'w', 'Rename a journal entry or move it to another folder.'),
  e('delete-journal', 'd', 'Delete a journal entry and all its pages.'),
  e('create-journal-page', 'w', 'Add a text, image, video or PDF page to a journal entry. Text is HTML; inline styles survive, <style> and <script> are stripped.'),
  e('update-journal-page', 'w', 'Change a journal page\'s name, content or source.'),
  e('delete-journal-page', 'd', 'Delete one journal page.'),
  e('show-journal', 'w', 'Pop a journal entry or page up on players\' screens. force shows it even without permission; users limits who sees it.'),

  // Roll tables
  e('list-roll-tables', 'r', 'List roll tables.'),
  e('get-roll-table', 'r', 'One roll table with its formula and results.'),
  e('create-roll-table', 'w', 'Create a roll table with results.'),
  e('update-roll-table', 'w', 'Change a roll table\'s settings.'),
  e('delete-roll-table', 'd', 'Delete a roll table.'),
  e('roll-on-table', 'w', 'Draw from a roll table, optionally posting the result to chat.'),
  e('reset-table', 'w', 'Mark every result of a table as undrawn again.'),

  // Macros
  e('get-macros', 'r', 'List macros.'),
  e('get-macro', 'r', 'One macro including its command.'),
  e('create-macro', 'w', 'Create a chat or script macro.'),
  e('update-macro', 'w', 'Change a macro.'),
  e('delete-macro', 'd', 'Delete a macro.'),
  e('execute-macro', 'w', 'Run a macro, optionally as an actor or token. Script macros run only if the GM enabled them in the module settings.'),

  // Playlists
  e('get-playlists', 'r', 'List playlists and whether they are playing.'),
  e('get-playlist', 'r', 'One playlist with its sounds.'),
  e('play-playlist', 'w', 'Start a playlist.'),
  e('stop-playlist', 'w', 'Stop a playlist.'),
  e('play-sound-in-playlist', 'w', 'Play one sound from a playlist.'),
  e('stop-sound-in-playlist', 'w', 'Stop one sound in a playlist.'),
  e('play-sound-once', 'w', 'Play an audio file once, for everyone if broadcast is true.'),
  e('add-sound-to-playlist', 'w', 'Add an audio file to a playlist.'),

  // Scenes
  e('get-scenes-list', 'r', 'List scenes with ids and which one is active.'),
  e('get-scene', 'r', 'Full scene details: grid, tokens, walls, lights, notes. includeScreenshot adds an image of the canvas.'),
  e('capture-scene', 'r', 'Screenshot of the current canvas with a coordinate grid, for spatial reasoning.'),
  e('activate-scene', 'w', 'Make a scene the active one, moving all players to it.'),
  e('view-scene', 'w', 'Switch only the GM\'s view to a scene without moving players.'),
  e('create-scene', 'w', 'Create a scene with background, grid and size.'),
  e('update-scene', 'w', 'Change a scene\'s settings (darkness, background, grid, navigation, ...).'),
  e('clone-scene', 'w', 'Duplicate a scene.'),
  e('delete-scene', 'd', 'Delete a scene.'),

  // Walls, doors, notes
  e('get-walls', 'r', 'Walls and doors on a scene. door 1 = door, 2 = secret door.'),
  e('create-wall', 'w', 'Create a wall from coordinates c = [x1, y1, x2, y2].'),
  e('update-wall', 'w', 'Change a wall.'),
  e('delete-wall', 'd', 'Delete a wall.'),
  e('set-door-state', 'w', 'Open (1), close (0) or lock (2) a door by its wall id.'),
  e('get-notes', 'r', 'Map notes (journal pins) on a scene.'),
  e('create-note', 'w', 'Pin a map note on a scene, optionally linked to a journal entry or page.'),
  e('update-note', 'w', 'Change a map note.'),
  e('delete-note', 'd', 'Delete a map note.'),

  // Tokens
  e('get-scene-tokens', 'r', 'Tokens on a scene with position, HP, conditions, disposition and actor link.'),
  e('get-token', 'r', 'One token\'s details.'),
  e('get-token-by-actor', 'r', 'Find the token(s) of an actor on a scene.'),
  e('get-tokens-in-range', 'r', 'Tokens within a distance (scene units) of a point.'),
  e('create-token', 'w', 'Place a token for an actor at scene-pixel x, y (top-left of the grid cell).'),
  e('move-token', 'w', 'Move a token to x, y. It walks around walls with pathfinding and can open doors on the way if canOpenDoors is set.'),
  e('update-token', 'w', 'Change a token: name, visibility, disposition, elevation, scale, actor link.'),
  e('delete-token', 'd', 'Remove a token from a scene (the actor stays).'),
  e('set-token-target', 'w', 'Target or untarget a token for the GM, as used by attack automation.'),
  e('clear-targets', 'w', 'Clear all of the GM\'s targets.'),

  // Combat
  e('get-combat-state', 'r', 'The active (or given) combat: round, turn, combatants and initiative.'),
  e('get-combat-turn-context', 'r', 'Everything needed to run the current turn: whose turn it is, their stats and nearby tokens.'),
  e('create-combat', 'w', 'Create a combat encounter on a scene.'),
  e('delete-combat', 'd', 'Delete a combat encounter.'),
  e('start-combat', 'w', 'Start the combat (after initiative is rolled).'),
  e('end-combat', 'w', 'End the combat.'),
  e('next-turn', 'w', 'Advance to the next turn.'),
  e('previous-turn', 'w', 'Go back one turn.'),
  e('set-turn', 'w', 'Jump to a specific combatant\'s turn.'),
  e('add-combatant', 'w', 'Add an actor or token to the combat, optionally hidden or with a set initiative.'),
  e('remove-combatant', 'd', 'Remove a combatant.'),
  e('update-combatant', 'w', 'Change a combatant\'s initiative, visibility or defeated state.'),
  e('roll-initiative', 'w', 'Roll initiative for specific combatants.'),
  e('roll-all-initiative', 'w', 'Roll initiative for every combatant, or NPCs only.'),
  e('set-initiative', 'w', 'Set a combatant\'s initiative to a value.'),
  e('set-combatant-defeated', 'w', 'Mark a combatant defeated or not.'),
  e('toggle-combatant-visibility', 'w', 'Hide or reveal a combatant in the tracker.'),

  // Compendiums
  e('get-compendiums', 'r', 'List compendium packs with ids, labels, document types and sizes.'),
  e('get-compendium', 'r', 'Documents in one pack, optionally only some subtypes or ids.'),
  e('get-compendium-index', 'r', 'The lightweight index of a pack, with extra fields if asked.'),
  e('get-compendium-document', 'r', 'One full document from a pack.'),
  e('search-compendium', 'r', 'Search one pack by name and field filters. Paginated.'),
  e('search-compendiums', 'r', 'Search document names across all packs, optionally by document type.'),
  e('search-compendium-pages', 'r', 'Full-text search inside journal compendium pages (rules, lore, adventure text). Returns snippets and page UUIDs.'),
  e('import-from-compendium', 'w', 'Import any compendium document into the world.'),
  e('resolve-uuid', 'r', 'Fetch any document by absolute UUID: world, compendium, or embedded (Actor.x.Item.y, journal pages).'),

  // D&D 5e
  e('dnd5e/roll-ability', 'w', 'D&D 5e ability check (str, dex, con, int, wis, cha), with advantage or disadvantage.'),
  e('dnd5e/roll-skill', 'w', 'D&D 5e skill check by skill code (ste, prc, inv, ath, ...), with advantage or disadvantage.'),
  e('dnd5e/roll-save', 'w', 'D&D 5e saving throw, with advantage or disadvantage.'),
  e('dnd5e/roll-perception', 'w', 'D&D 5e Perception check.'),
  e('dnd5e/roll-attack', 'w', 'D&D 5e attack roll with a weapon or spell item.'),
  e('dnd5e/roll-damage', 'w', 'D&D 5e damage roll for an item; critical doubles dice.'),
  e('dnd5e/use-item', 'w', 'Use an item or activity (spell, feature, consumable) without targets.'),
  e('dnd5e/activate-item', 'w', 'Full automated use of an item against targets (Midi-QOL aware): attack, damage and HP applied, templates placed. Dialogs are skipped by default. A status of awaiting_user_dialog means the GM must click; do not repeat the call.'),
  e('dnd5e/apply-damage', 'w', 'Apply damage to an actor or one token; temp HP and resistances to the damage type apply.'),
  e('dnd5e/apply-healing', 'w', 'Heal an actor or one token up to max HP.'),
  e('dnd5e/filter-compendium-actors', 'r', 'Search compendium monsters by CR, creature type, size, AC, HP and abilities.'),
  e('dnd5e/filter-compendium-items', 'r', 'Search compendium items and spells by type, rarity, price, spell level and school.'),

  // Pathfinder 2e
  e('pf2e/roll-skill', 'w', 'PF2e skill check.'),
  e('pf2e/roll-save', 'w', 'PF2e saving throw (fortitude, reflex, will).'),
  e('pf2e/roll-perception', 'w', 'PF2e Perception check.'),
  e('pf2e/list-strikes', 'r', 'PF2e strikes of an actor, with the slugs used for strike rolls.'),
  e('pf2e/roll-strike', 'w', 'PF2e strike by slug, with multiple-attack penalty step.'),
  e('pf2e/roll-strike-damage', 'w', 'PF2e strike damage, optionally critical.'),
  e('pf2e/cast-spell', 'w', 'PF2e cast a spell, optionally heightened.'),
  e('pf2e/use-consumable', 'w', 'PF2e use a consumable.'),
  e('pf2e/post-item', 'w', 'PF2e post an item card to chat.'),
  e('pf2e/get-conditions', 'r', 'PF2e conditions on an actor.'),
  e('pf2e/set-condition', 'w', 'PF2e apply a condition, with value for valued ones.'),
  e('pf2e/increase-condition', 'w', 'PF2e raise a valued condition by one.'),
  e('pf2e/decrease-condition', 'w', 'PF2e lower a valued condition by one.'),
  e('pf2e/remove-condition', 'w', 'PF2e remove a condition.'),
  e('pf2e/filter-compendium-actors', 'r', 'PF2e search compendium creatures by level, traits, rarity and size.'),
  e('pf2e/filter-compendium-items', 'r', 'PF2e search compendium items by level, traits, rarity, price and tradition.'),
];

export const toolName = (command: string) => command.replace('/', '-');

/** System prefix of a command, or undefined if it works in every system. */
export const systemOf = (command: string) => (command.includes('/') ? command.split('/')[0] : undefined);
