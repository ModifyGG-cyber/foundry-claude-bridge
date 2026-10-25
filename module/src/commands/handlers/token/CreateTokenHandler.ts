import type { CreateTokenParams, TokenResult } from '@/commands/types';
import {
  getActiveScene,
  mapTokenToResult,
  type FoundryGame,
  type TokenCreateData
} from './tokenTypes';

interface PrototypeTokenActor {
  getTokenDocument?(data: Record<string, unknown>): Promise<{ toObject(): Record<string, unknown> }>;
}

declare const game: FoundryGame & { actors?: { get(id: string): PrototypeTokenActor | undefined } };

/** Start from the actor's prototype token so the token gets its own art, size, name and disposition. */
async function withPrototype(data: TokenCreateData): Promise<TokenCreateData> {
  const actor = game.actors?.get(data.actorId);
  if (!actor?.getTokenDocument) return data;
  const prototype = await actor.getTokenDocument({ ...data });
  return { ...prototype.toObject(), ...data };
}

export async function createTokenHandler(params: CreateTokenParams): Promise<TokenResult> {
  const scene = getActiveScene(game, params.sceneId);

  const tokenData: TokenCreateData = {
    actorId: params.actorId,
    x: params.x,
    y: params.y
  };

  if (params.hidden !== undefined) {
    tokenData.hidden = params.hidden;
  }
  if (params.elevation !== undefined) {
    tokenData.elevation = params.elevation;
  }
  if (params.rotation !== undefined) {
    tokenData.rotation = params.rotation;
  }
  if (params.scale !== undefined) {
    tokenData.scale = params.scale;
  }
  if (params.actorLink !== undefined) {
    tokenData.actorLink = params.actorLink;
  }

  const [token] = await scene.createEmbeddedDocuments('Token', [await withPrototype(tokenData)]);

  if (!token) {
    throw new Error('Failed to create token');
  }

  return mapTokenToResult(token);
}