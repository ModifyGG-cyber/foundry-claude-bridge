import { d100Total, meetsDifficulty, resolveD100, successLevel } from '../d100';

describe('CoC7 d100 rules', () => {
  it('reads tens and unit dice, with 00 + 0 as 100', () => {
    expect(d100Total(10, 1)).toBe(1);
    expect(d100Total(4, 7)).toBe(47);
    expect(d100Total(10, 10)).toBe(100);
    expect(d100Total(9, 10)).toBe(90);
  });

  it('keeps the lowest total with bonus dice and the highest with penalty dice', () => {
    const roll = { baseDie: 7, unitDie: 3, bonusDice: [2, 9], penaltyDice: [9, 1] };
    expect(resolveD100(roll, 0).total).toBe(73);
    expect(resolveD100(roll, 1)).toEqual({ total: 23, tensDice: [7, 2] });
    expect(resolveD100(roll, 2).total).toBe(23);
    expect(resolveD100(roll, -1)).toEqual({ total: 93, tensDice: [7, 9] });
  });

  it('grades success levels against the skill value', () => {
    expect(successLevel(1, 40)).toBe('critical');
    expect(successLevel(8, 40)).toBe('extreme');
    expect(successLevel(9, 40)).toBe('hard');
    expect(successLevel(20, 40)).toBe('hard');
    expect(successLevel(40, 40)).toBe('regular');
    expect(successLevel(41, 40)).toBe('failure');
  });

  it('fumbles on 96-100 below 50, and only on 100 from 50 up', () => {
    expect(successLevel(96, 49)).toBe('fumble');
    expect(successLevel(96, 50)).toBe('failure');
    expect(successLevel(100, 75)).toBe('fumble');
  });

  it('compares success levels with the required difficulty', () => {
    expect(meetsDifficulty('hard', 'regular')).toBe(true);
    expect(meetsDifficulty('regular', 'hard')).toBe(false);
    expect(meetsDifficulty('critical', 'critical')).toBe(true);
    expect(meetsDifficulty('fumble', 'regular')).toBe(false);
  });
});
