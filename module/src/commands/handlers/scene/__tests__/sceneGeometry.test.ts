import { actorHp, gridBounds } from '../sceneGeometry';

describe('sceneGeometry', () => {
  it('converts the scene rect to grid cells', () => {
    expect(gridBounds({ sceneX: 500, sceneY: 400, sceneWidth: 2000, sceneHeight: 1500 }, 100))
      .toEqual({ minGX: 5, minGY: 4, maxGX: 24, maxGY: 18 });
  });

  it('reads hit points from dnd5e and CoC7 actors', () => {
    expect(actorHp({ attributes: { hp: { value: 7, max: 12 } } })).toEqual({ value: 7, max: 12 });
    expect(actorHp({ attribs: { hp: { value: 9, max: 11 } } })).toEqual({ value: 9, max: 11 });
    expect(actorHp({ attribs: { hp: { value: null, max: 11 } } })).toBeUndefined();
    expect(actorHp(undefined)).toBeUndefined();
  });
});
