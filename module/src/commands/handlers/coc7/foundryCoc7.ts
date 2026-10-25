/**
 * Minimal view of the Foundry and Call of Cthulhu 7th Edition (CoC7 8.x) APIs
 * the coc7/* handlers use. Read from globalThis so tests can supply fakes.
 */

export interface Coc7Item {
  id: string;
  name: string;
  type: string;
  system: Record<string, unknown> & { value?: unknown };
}

export interface Coc7CheckOptions {
  difficulty?: string;
  poolModifier?: number;
  blind?: boolean;
}

export interface Coc7Actor {
  id: string;
  uuid: string;
  name: string;
  type: string;
  statuses?: Set<string>;
  system: {
    characteristics?: Record<string, { value?: number | null }>;
    attribs?: Record<string, { value?: number | null; max?: number | null }>;
    infos?: { occupation?: string };
    /** Present on characters only; NPCs and creatures have no reason tracking. */
    sanityLossEvents?: unknown[];
  };
  items: { filter(fn: (item: Coc7Item) => boolean): Coc7Item[] };
  skillCheck(skill: string, fastForward: boolean, options?: Coc7CheckOptions): Promise<unknown>;
  characteristicCheck(name: string, fastForward: boolean, options?: Coc7CheckOptions): Promise<unknown>;
  attributeCheck(name: string, fastForward: boolean, options?: Coc7CheckOptions): Promise<unknown>;
  loseSan(reason: string, amount: number): Promise<number>;
  spendLuck(amount: number): Promise<unknown>;
  dealDamage(amount: number, options?: { ignoreArmor?: boolean }): Promise<number>;
}

export interface Coc7ChatMessage {
  id: string;
  flags?: { CoC7?: { load?: Record<string, unknown> } };
}

export interface Coc7Game {
  actors: { get(id: string): Coc7Actor | undefined };
  scenes: {
    get(id: string): { id: string; tokens: { get(id: string): { id: string; actor: Coc7Actor | null } | undefined } } | undefined;
    active: { id: string; tokens: { get(id: string): { id: string; actor: Coc7Actor | null } | undefined } } | null;
  };
}

export interface Coc7Hooks {
  on(hook: string, fn: (...args: unknown[]) => void): number;
  off(hook: string, id: number): void;
}

export interface Coc7Globals {
  game: Coc7Game;
  Hooks: Coc7Hooks;
  ChatMessage: {
    create(data: Record<string, unknown>): Promise<{ id: string }>;
    getWhisperRecipients?(name: string): { id: string }[];
  };
  Roll: new (formula: string) => { evaluate(): Promise<{ total: number }> };
}

export function getCoc7Globals(): Coc7Globals {
  return globalThis as unknown as Coc7Globals;
}
