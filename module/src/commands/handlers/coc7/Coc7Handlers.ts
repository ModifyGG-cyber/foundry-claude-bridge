import type {
  Coc7ActorParams,
  Coc7CheckKind,
  Coc7CheckResult,
  Coc7DealDamageParams,
  Coc7Difficulty,
  Coc7InvestigatorResult,
  Coc7LoseSanityParams,
  Coc7RequestRollParams,
  Coc7RequestRollResult,
  Coc7RollCheckParams,
  Coc7RollRequest,
  Coc7SpendLuckParams,
  Coc7ValueChangeResult
} from '@/commands/types';
import { requireSystem } from '@/systems';
import { resolveActorTarget } from '../actorTarget';
import { DIFFICULTY_CODE, DIFFICULTY_FROM_LEVEL, meetsDifficulty, resolveD100, successLevel, type RolledD100 } from './d100';
import { getCoc7Globals, type Coc7Actor, type Coc7ChatMessage, type Coc7Item } from './foundryCoc7';

const SYSTEM = 'CoC7';
const CHECK_CARD_TIMEOUT_MS = 15_000;
const CHARACTERISTICS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu'];
const ATTRIBUTES = ['lck', 'san'];
const DIFFICULTIES: Coc7Difficulty[] = ['regular', 'hard', 'extreme', 'critical'];

function actorFor(params: Coc7ActorParams): Coc7Actor {
  return resolveActorTarget(getCoc7Globals().game, params).actor;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

function checkDifficulty(difficulty: unknown): Coc7Difficulty {
  if (difficulty === undefined) return 'regular';
  if (!DIFFICULTIES.includes(difficulty as Coc7Difficulty)) {
    throw new Error(`difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  }
  return difficulty as Coc7Difficulty;
}

function checkBonusDice(bonusDice: unknown): number {
  const value = bonusDice === undefined ? 0 : Number(bonusDice);
  if (!Number.isInteger(value) || value < -2 || value > 2) {
    throw new Error('bonusDice must be an integer from -2 (two penalty dice) to 2 (two bonus dice)');
  }
  return value;
}

function findSkill(actor: Coc7Actor, name: string): Coc7Item {
  const skills = actor.items.filter(i => i.type === 'skill');
  const wanted = name.toLocaleLowerCase();
  const exact = skills.find(s => s.name.toLocaleLowerCase() === wanted);
  if (exact) return exact;
  const partial = skills.filter(s => s.name.toLocaleLowerCase().includes(wanted));
  if (partial.length === 1 && partial[0]) return partial[0];
  const hint = partial.length > 1 ? ` Did you mean: ${partial.map(s => s.name).join(', ')}?` : '';
  throw new Error(`${actor.name} has no skill named "${name}".${hint}`);
}

/** Waits for the chat card the CoC7 system posts for a check by this actor. */
function waitForCheckCard(actorUuid: string): { promise: Promise<Coc7ChatMessage>; cancel: () => void } {
  const { Hooks } = getCoc7Globals();
  let hookId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    Hooks.off('createChatMessage', hookId);
    if (timer) clearTimeout(timer);
  };
  const promise = new Promise<Coc7ChatMessage>((resolve, reject) => {
    hookId = Hooks.on('createChatMessage', (...args: unknown[]) => {
      const message = args[0] as Coc7ChatMessage;
      const load = message.flags?.CoC7?.load;
      if (load?.['as'] === 'CoC7Check' && load['actorUuid'] === actorUuid) {
        cancel();
        resolve(message);
      }
    });
    timer = setTimeout(() => {
      cancel();
      reject(new Error('The CoC7 system did not post a check card. A dialog may be open on the GM screen, or the check could not be made.'));
    }, CHECK_CARD_TIMEOUT_MS);
  });
  return { promise, cancel };
}

function readCheckCard(message: Coc7ChatMessage): Pick<Coc7CheckResult, 'threshold' | 'total' | 'tensDice' | 'unitDie' | 'bonusDice'> & { difficultyLevel: number | null } {
  const pool = message.flags?.CoC7?.load?.['dicePool'] as
    | { threshold?: number; flatThresholdModifier?: number; currentPoolModifier?: number; difficulty?: number; rolledDice?: (RolledD100 & { rolled: boolean })[] }
    | undefined;
  const roll = pool?.rolledDice?.filter(r => r.rolled).pop();
  const threshold = num(pool?.threshold);
  const effective = threshold === null ? null : threshold + (num(pool?.flatThresholdModifier) ?? 0);
  const poolModifier = num(pool?.currentPoolModifier) ?? 0;
  const resolved = roll ? resolveD100(roll, poolModifier) : null;
  return {
    threshold: effective,
    total: resolved?.total ?? null,
    tensDice: resolved?.tensDice ?? [],
    unitDie: roll ? roll.unitDie % 10 : null,
    bonusDice: poolModifier,
    difficultyLevel: num(pool?.difficulty)
  };
}

export async function coc7RollCheckHandler(params: Coc7RollCheckParams): Promise<Coc7CheckResult> {
  requireSystem(SYSTEM, 'coc7/roll-check');
  const actor = actorFor(params);
  const difficulty = checkDifficulty(params.difficulty);
  const bonusDice = checkBonusDice(params.bonusDice);
  // Validated at runtime: the relay forwards whatever the caller sent.
  const kind = params.kind as string;
  const options = {
    difficulty: DIFFICULTY_CODE[difficulty],
    poolModifier: bonusDice,
    ...(params.blind !== undefined ? { blind: params.blind } : {})
  };

  let name = params.name;
  let start: () => Promise<unknown>;
  let checkKind: Coc7CheckKind;
  if (kind === 'skill') {
    name = findSkill(actor, params.name).name;
    checkKind = 'skill';
    start = (): Promise<unknown> => actor.skillCheck(name, true, options);
  } else if (kind === 'characteristic') {
    name = params.name.toLowerCase();
    if (!CHARACTERISTICS.includes(name)) throw new Error(`characteristic must be one of ${CHARACTERISTICS.join(', ')}`);
    checkKind = 'characteristic';
    start = (): Promise<unknown> => actor.characteristicCheck(name, true, options);
  } else if (kind === 'attribute') {
    name = params.name.toLowerCase();
    if (!ATTRIBUTES.includes(name)) throw new Error(`attribute must be one of ${ATTRIBUTES.join(', ')}`);
    checkKind = 'attribute';
    start = (): Promise<unknown> => actor.attributeCheck(name, true, options);
  } else {
    throw new Error('kind must be skill, characteristic or attribute');
  }

  const card = waitForCheckCard(actor.uuid);
  try {
    await start();
  } catch (error) {
    card.cancel();
    throw error;
  }
  const message = await card.promise;
  const read = readCheckCard(message);
  const level = read.total !== null && read.threshold !== null ? successLevel(read.total, read.threshold) : null;
  const required = (read.difficultyLevel !== null ? DIFFICULTY_FROM_LEVEL[read.difficultyLevel] : undefined) ?? difficulty;
  return {
    messageId: message.id,
    actorId: actor.id,
    actorName: actor.name,
    kind: checkKind,
    name,
    threshold: read.threshold,
    difficulty: required,
    bonusDice: read.bonusDice,
    total: read.total,
    tensDice: read.tensDice,
    unitDie: read.unitDie,
    successLevel: level,
    passed: level === null ? null : meetsDifficulty(level, required)
  };
}

export function coc7GetInvestigatorHandler(params: Coc7ActorParams): Promise<Coc7InvestigatorResult> {
  requireSystem(SYSTEM, 'coc7/get-investigator');
  const actor = actorFor(params);
  const characteristics: Record<string, number | null> = {};
  for (const [key, c] of Object.entries(actor.system.characteristics ?? {})) characteristics[key] = num(c.value);
  const attributes: Coc7InvestigatorResult['attributes'] = {};
  for (const [key, a] of Object.entries(actor.system.attribs ?? {})) {
    attributes[key] = { value: num(a.value), ...(a.max !== undefined ? { max: num(a.max) } : {}) };
  }
  const skillName = (s: unknown): string | null => {
    if (!s) return null;
    if (typeof s === 'string') return s;
    return (s as { name?: string }).name ?? null;
  };
  return Promise.resolve({
    id: actor.id,
    name: actor.name,
    type: actor.type,
    occupation: actor.system.infos?.occupation || null,
    characteristics,
    attributes,
    skills: actor.items
      .filter(i => i.type === 'skill')
      .map(i => ({ id: i.id, name: i.name, value: num(i.system.value) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    weapons: actor.items
      .filter(i => i.type === 'weapon')
      .map(i => {
        const range = i.system['range'] as { normal?: { damage?: string } } | undefined;
        return { id: i.id, name: i.name, damage: range?.normal?.damage ?? null, skill: skillName(i.system['skillMain']) };
      }),
    statuses: [...(actor.statuses ?? [])]
  });
}

function linkFor(request: Coc7RollRequest): string {
  const options: string[] = [];
  if (request.blind) options.push('blind');
  let type: string;
  if (request.kind === 'sanity') {
    type = 'sanloss';
    options.push(`sanMin:${request.sanMin ?? '0'}`, `sanMax:${request.sanMax ?? '1D6'}`);
    if (request.sanReason) options.push(`sanReason:${request.sanReason}`);
  } else {
    if (!request.name) throw new Error(`A ${request.kind} roll request needs a name`);
    type = 'check';
    options.push(`subtype:${request.kind}`, `name:${request.name}`);
  }
  if (request.difficulty) options.push(`difficulty:${DIFFICULTY_CODE[checkDifficulty(request.difficulty)]}`);
  const bonus = checkBonusDice(request.bonusDice);
  if (bonus !== 0) options.push(`poolModifier:${bonus > 0 ? '+' : ''}${String(bonus)}`);
  for (const option of options) {
    if (/[[\]{},]/.test(option)) throw new Error(`Roll request values cannot contain [ ] { } or commas: ${option}`);
  }
  const label = request.label ?? (request.kind === 'sanity' ? `SAN ${request.sanMin ?? '0'}/${request.sanMax ?? '1D6'}` : request.name);
  return `@coc7.${type}[${options.join(',')}]{${String(label).replace(/[{}]/g, '')}}`;
}

export async function coc7RequestRollHandler(params: Coc7RequestRollParams): Promise<Coc7RequestRollResult> {
  requireSystem(SYSTEM, 'coc7/request-roll');
  if (!Array.isArray(params.requests) || params.requests.length === 0) throw new Error('requests needs at least one roll');
  const links = params.requests.map(linkFor);
  const content = `${params.message ? `<p>${params.message}</p>` : ''}<p>${links.join(' ')}</p>`;
  const { ChatMessage } = getCoc7Globals();
  const message = await ChatMessage.create({
    content,
    speaker: { alias: 'Keeper' },
    ...(params.whisperTo?.length ? { whisper: params.whisperTo } : {})
  });
  return { messageId: message.id, links };
}

async function rollAmount(amount: number | string): Promise<{ value: number; rolled?: number }> {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('amount must be zero or more');
    return { value: Math.floor(amount) };
  }
  const { Roll } = getCoc7Globals();
  const result = await new Roll(amount).evaluate();
  return { value: result.total, rolled: result.total };
}

export async function coc7LoseSanityHandler(params: Coc7LoseSanityParams): Promise<Coc7ValueChangeResult> {
  requireSystem(SYSTEM, 'coc7/lose-sanity');
  const actor = actorFor(params);
  const before = num(actor.system.attribs?.['san']?.value) ?? 0;
  const { value, rolled } = await rollAmount(params.amount);
  const lost = await actor.loseSan(params.reason ?? '', value);
  const after = num(actor.system.attribs?.['san']?.value) ?? before - lost;
  return {
    actorId: actor.id,
    actorName: actor.name,
    before,
    after,
    ...(rolled !== undefined ? { rolled } : {}),
    applied: lost > 0,
    ...(value > 0 && lost === 0 ? { note: `${actor.name} is immune to further SAN loss from "${params.reason ?? ''}".` } : {})
  };
}

export async function coc7SpendLuckHandler(params: Coc7SpendLuckParams): Promise<Coc7ValueChangeResult> {
  requireSystem(SYSTEM, 'coc7/spend-luck');
  const actor = actorFor(params);
  if (!Number.isInteger(params.amount) || params.amount <= 0) throw new Error('amount must be a positive integer');
  const before = num(actor.system.attribs?.['lck']?.value) ?? 0;
  const ok = await actor.spendLuck(params.amount);
  const after = num(actor.system.attribs?.['lck']?.value) ?? before;
  return {
    actorId: actor.id,
    actorName: actor.name,
    before,
    after,
    applied: ok !== false,
    ...(ok === false ? { note: `${actor.name} has only ${String(before)} Luck.` } : {})
  };
}

export async function coc7DealDamageHandler(params: Coc7DealDamageParams): Promise<Coc7ValueChangeResult> {
  requireSystem(SYSTEM, 'coc7/deal-damage');
  const actor = actorFor(params);
  const before = num(actor.system.attribs?.['hp']?.value) ?? 0;
  const { value, rolled } = await rollAmount(params.amount);
  const dealt = await actor.dealDamage(value, { ignoreArmor: params.ignoreArmor ?? false });
  const after = num(actor.system.attribs?.['hp']?.value) ?? before - dealt;
  return {
    actorId: actor.id,
    actorName: actor.name,
    before,
    after,
    ...(rolled !== undefined ? { rolled } : {}),
    applied: dealt > 0,
    ...(dealt < value ? { note: `Armour absorbed ${String(value - dealt)}.` } : {})
  };
}
