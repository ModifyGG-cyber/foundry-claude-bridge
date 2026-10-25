type HookFn = (...args: unknown[]) => void;
const hooks = new Map<number, HookFn>();
let nextHook = 1;

const skills = [
  { id: 's1', name: 'Spot Hidden', type: 'skill', system: { value: 60 } },
  { id: 's2', name: 'Language (Other) (Latin)', type: 'skill', system: { value: 31 } },
  { id: 's3', name: 'Language (Other) (Greek)', type: 'skill', system: { value: 11 } },
  { id: 'w1', name: '.38 Revolver', type: 'weapon', system: { range: { normal: { damage: '1D10' } }, skillMain: { name: 'Firearms (Handgun)' } } }
];

/** Posts a check card the way the CoC7 system does, with a pre-set roll. */
let nextRoll = { baseDie: 3, unitDie: 5, bonusDice: [] as number[], penaltyDice: [] as number[] };
const postCard = (threshold: number, options: { difficulty?: string; poolModifier?: number }): Promise<void> => {
  const levels: Record<string, number> = { '0': 1, '+': 2, '++': 3, '+++': 4 };
  const message = {
    id: 'm1',
    flags: {
      CoC7: {
        load: {
          as: 'CoC7Check',
          actorUuid: 'Actor.a1',
          dicePool: {
            threshold,
            flatThresholdModifier: 0,
            currentPoolModifier: options.poolModifier ?? 0,
            difficulty: levels[options.difficulty ?? '0'],
            rolledDice: [{ ...nextRoll, rolled: true }]
          }
        }
      }
    }
  };
  for (const fn of [...hooks.values()]) fn(message);
  return Promise.resolve();
};

const actor = {
  id: 'a1',
  uuid: 'Actor.a1',
  name: 'Harvey Walters',
  type: 'character',
  statuses: new Set(['prone']),
  system: {
    characteristics: { str: { value: 40 }, int: { value: 85 } },
    attribs: { hp: { value: 10, max: 10 }, san: { value: 55, max: 99 }, lck: { value: 30 } },
    infos: { occupation: 'Professor' },
    sanityLossEvents: [] as unknown[]
  },
  items: { filter: (fn: (i: (typeof skills)[number]) => boolean) => skills.filter(fn) },
  skillCheck: jest.fn((name: string, _ff: boolean, options: { difficulty?: string; poolModifier?: number }) =>
    postCard(skills.find(s => s.name === name)?.system.value as number, options)),
  characteristicCheck: jest.fn((name: string, _ff: boolean, options: { difficulty?: string; poolModifier?: number }) =>
    postCard(name === 'int' ? 85 : 40, options)),
  attributeCheck: jest.fn((_name: string, _ff: boolean, options: object) => postCard(30, options)),
  loseSan: jest.fn(async (_reason: string, amount: number) => { actor.system.attribs.san.value -= amount; return amount; }),
  spendLuck: jest.fn(async (amount: number) => {
    if (actor.system.attribs.lck.value < amount) return false;
    actor.system.attribs.lck.value -= amount;
    return {};
  }),
  dealDamage: jest.fn(async (amount: number) => { const dealt = Math.max(0, amount - 1); actor.system.attribs.hp.value -= dealt; return dealt; })
};

/** An NPC as CoC7 builds one: no sanityLossEvents, and setSan doesn't wait for its update. */
const npc = {
  ...actor,
  id: 'n1',
  uuid: 'Actor.n1',
  name: 'Cultist',
  type: 'npc',
  statuses: new Set<string>(),
  system: { attribs: { hp: { value: 12, max: 12 }, san: { value: 38, max: 99 } } } as typeof actor.system,
  loseSan: jest.fn(async (reason: string, amount: number) => {
    // Reproduces CoC7: SAN is taken first, then the reason bookkeeping fails on an NPC.
    npc.statuses.add('tempoInsane');
    if (reason !== '') throw new SyntaxError('"undefined" is not valid JSON');
    return amount;
  })
};

const chatCreate = jest.fn(async () => ({ id: 'chat1' }));
const mockGame = { system: { id: 'CoC7' }, actors: { get: (id: string) => (id === 'a1' ? actor : id === 'n1' ? npc : undefined) }, scenes: { get: () => undefined, active: null } };
Object.assign(globalThis, {
  game: mockGame,
  Hooks: {
    on: (_name: string, fn: HookFn) => { const id = nextHook++; hooks.set(id, fn); return id; },
    off: (_name: string, id: number) => { hooks.delete(id); }
  },
  ChatMessage: { create: chatCreate },
  Roll: class { constructor(public formula: string) {} evaluate() { return Promise.resolve({ total: 4 }); } }
});

import {
  coc7DealDamageHandler,
  coc7GetInvestigatorHandler,
  coc7LoseSanityHandler,
  coc7RequestRollHandler,
  coc7RollCheckHandler,
  coc7SpendLuckHandler
} from '../Coc7Handlers';

describe('CoC7 handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGame.system.id = 'CoC7';
    nextRoll = { baseDie: 3, unitDie: 5, bonusDice: [], penaltyDice: [] };
  });

  it('rolls a skill with the system and reports the graded result', async () => {
    const result = await coc7RollCheckHandler({ actorId: 'a1', kind: 'skill', name: 'spot hidden' });
    expect(actor.skillCheck).toHaveBeenCalledWith('Spot Hidden', true, { difficulty: '0', poolModifier: 0 });
    expect(result).toMatchObject({ messageId: 'm1', name: 'Spot Hidden', threshold: 60, total: 35, successLevel: 'regular', passed: true, difficulty: 'regular' });
    expect(hooks.size).toBe(0);
  });

  it('applies bonus dice and a hard difficulty', async () => {
    nextRoll = { baseDie: 7, unitDie: 2, bonusDice: [1], penaltyDice: [] };
    const result = await coc7RollCheckHandler({ actorId: 'a1', kind: 'characteristic', name: 'INT', difficulty: 'hard', bonusDice: 1 });
    expect(actor.characteristicCheck).toHaveBeenCalledWith('int', true, { difficulty: '+', poolModifier: 1 });
    expect(result).toMatchObject({ total: 12, tensDice: [7, 1], successLevel: 'extreme', passed: true, difficulty: 'hard' });
  });

  it('reports a failed hard check', async () => {
    nextRoll = { baseDie: 5, unitDie: 5, bonusDice: [], penaltyDice: [] };
    const result = await coc7RollCheckHandler({ actorId: 'a1', kind: 'attribute', name: 'lck', difficulty: 'hard' });
    expect(result).toMatchObject({ total: 55, threshold: 30, successLevel: 'failure', passed: false });
  });

  it('refuses ambiguous or missing skills without rolling', async () => {
    await expect(coc7RollCheckHandler({ actorId: 'a1', kind: 'skill', name: 'Language' })).rejects.toThrow(/Did you mean: Language \(Other\) \(Latin\), Language \(Other\) \(Greek\)/);
    await expect(coc7RollCheckHandler({ actorId: 'a1', kind: 'skill', name: 'Cthulhu Mythos' })).rejects.toThrow(/no skill named/);
    expect(actor.skillCheck).not.toHaveBeenCalled();
  });

  it('validates difficulty, bonus dice and characteristic keys', async () => {
    await expect(coc7RollCheckHandler({ actorId: 'a1', kind: 'skill', name: 'Spot Hidden', bonusDice: 3 })).rejects.toThrow(/bonusDice/);
    await expect(coc7RollCheckHandler({ actorId: 'a1', kind: 'characteristic', name: 'luck' })).rejects.toThrow(/characteristic must be/);
    await expect(coc7RollCheckHandler({ actorId: 'a1', kind: 'skill', name: 'Spot Hidden', difficulty: 'easy' as never })).rejects.toThrow(/difficulty must be/);
  });

  it('only runs in CoC7 worlds', async () => {
    mockGame.system.id = 'dnd5e';
    await expect(coc7RollCheckHandler({ actorId: 'a1', kind: 'skill', name: 'Spot Hidden' })).rejects.toThrow(/not supported by game system 'dnd5e'/);
  });

  it('summarises an investigator', async () => {
    const result = await coc7GetInvestigatorHandler({ actorId: 'a1' });
    expect(result.characteristics).toEqual({ str: 40, int: 85 });
    expect(result.attributes['san']).toEqual({ value: 55, max: 99 });
    expect(result.skills.map(s => s.name)).toEqual(['Language (Other) (Greek)', 'Language (Other) (Latin)', 'Spot Hidden']);
    expect(result.weapons).toEqual([{ id: 'w1', name: '.38 Revolver', damage: '1D10', skill: 'Firearms (Handgun)' }]);
    expect(result.occupation).toBe('Professor');
    expect(result.statuses).toEqual(['prone']);
  });

  it('posts roll-request links players can click', async () => {
    const result = await coc7RequestRollHandler({
      message: 'Everyone, look around.',
      requests: [
        { kind: 'skill', name: 'Spot Hidden', difficulty: 'hard', bonusDice: -1 },
        { kind: 'sanity', sanMin: '0', sanMax: '1D6', sanReason: 'Ghoul' }
      ]
    });
    expect(result.links).toEqual([
      '@coc7.check[subtype:skill,name:Spot Hidden,difficulty:+,poolModifier:-1]{Spot Hidden}',
      '@coc7.sanloss[sanMin:0,sanMax:1D6,sanReason:Ghoul]{SAN 0/1D6}'
    ]);
    expect(chatCreate).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Everyone, look around.') }));
  });

  it('rejects link values that would break the link syntax', async () => {
    await expect(coc7RequestRollHandler({ requests: [{ kind: 'skill', name: 'Spot, Hidden' }] })).rejects.toThrow(/cannot contain/);
  });

  it('loses sanity from a formula, spends luck, and deals damage through armour', async () => {
    const san = await coc7LoseSanityHandler({ actorId: 'a1', amount: '1D6', reason: 'Ghoul' });
    expect(actor.loseSan).toHaveBeenCalledWith('Ghoul', 4);
    expect(san).toMatchObject({ before: 55, after: 51, rolled: 4, applied: true });

    expect(await coc7SpendLuckHandler({ actorId: 'a1', amount: 10 })).toMatchObject({ before: 30, after: 20, applied: true });
    expect(await coc7SpendLuckHandler({ actorId: 'a1', amount: 50 })).toMatchObject({ applied: false, note: 'Harvey Walters has only 20 Luck.' });

    const hurt = await coc7DealDamageHandler({ actorId: 'a1', amount: 5 });
    expect(hurt).toMatchObject({ before: 10, after: 6, applied: true, note: 'Armour absorbed 1.' });
  });

  it('loses sanity on an NPC with a reason without failing, and reports the new value', async () => {
    const san = await coc7LoseSanityHandler({ actorId: 'n1', amount: 1, reason: 'Ghoul' });
    expect(npc.loseSan).toHaveBeenCalledWith('', 1);
    expect(san).toMatchObject({ before: 38, after: 37, applied: true, conditionsAdded: ['tempoInsane'] });
    expect(san.note).toMatch(/not recorded/);
  });

  it('never throws after SAN has changed', async () => {
    npc.loseSan.mockImplementationOnce(async () => {
      npc.system.attribs!['san']!.value = 30;
      throw new Error('boom');
    });
    const san = await coc7LoseSanityHandler({ actorId: 'n1', amount: 8 });
    expect(san).toMatchObject({ before: 38, after: 30, applied: true });
    expect(san.note).toMatch(/Do not retry/);
  });
});
