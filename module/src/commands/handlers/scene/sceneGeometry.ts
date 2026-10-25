/**
 * Coordinates in this module are Foundry canvas pixels, the same frame as TokenDocument x/y and
 * wall coordinates. The canvas includes the scene's padding, so the map image starts at
 * (sceneX, sceneY), not at (0, 0). Grid cells are canvas pixels divided by the grid size.
 */

export interface SceneRect {
  sceneX: number;
  sceneY: number;
  sceneWidth: number;
  sceneHeight: number;
}

export interface GridBounds {
  minGX: number;
  minGY: number;
  maxGX: number;
  maxGY: number;
}

export function gridBounds(rect: SceneRect, gridSize: number): GridBounds {
  return {
    minGX: Math.floor(rect.sceneX / gridSize),
    minGY: Math.floor(rect.sceneY / gridSize),
    maxGX: Math.ceil((rect.sceneX + rect.sceneWidth) / gridSize) - 1,
    maxGY: Math.ceil((rect.sceneY + rect.sceneHeight) / gridSize) - 1
  };
}

interface HpPool {
  value: number;
  max: number;
}

interface ActorSystemWithHp {
  attributes?: { hp?: HpPool };
  /** Call of Cthulhu keeps hit points under attribs. */
  attribs?: { hp?: { value?: number | null; max?: number | null } };
}

/** Hit points across systems: dnd5e/pf2e use attributes.hp, CoC7 uses attribs.hp. */
export function actorHp(system: ActorSystemWithHp | undefined): HpPool | undefined {
  if (system?.attributes?.hp) return system.attributes.hp;
  const hp = system?.attribs?.hp;
  if (typeof hp?.value === 'number' && typeof hp.max === 'number') return { value: hp.value, max: hp.max };
  return undefined;
}
