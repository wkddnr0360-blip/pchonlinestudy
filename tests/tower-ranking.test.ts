import { expect, test } from 'vitest'
import { calculateTowerRanks, rankedStagePair, normalStagePair, normalStagePairForAccess, nextSeasonSeed, type TowerRankInput } from '../src/challenge/ranking-policy'

function users(n: number): TowerRankInput[] {
  return Array.from({ length: n }, (_, i) => ({ userId: String(i).padStart(5, '0'), participated: true,
    distinctCorrect: 200, bestFloor: 60, achievedAt: i, eligible: true, access: 'verified' }))
}
test('exclusive upper tiers respect population caps and deterministic ties', () => {
  for (const n of [0, 1, 9, 10, 99, 100, 300, 1000]) {
    const result = calculateTowerRanks(users(n).reverse())
    const values = [...result.tiers.values()]
    expect(values.filter(x => x === 'diamond')).toHaveLength(Math.floor(n / 100))
    expect(values.filter(x => x === 'diamond' || x === 'platinum')).toHaveLength(Math.floor(n / 10))
    if (n >= 100) expect(result.tiers.get('00000')).toBe('diamond')
  }
})
test('unranked or excluded users do not inflate the denominator; gold and skill gates apply', () => {
  const roster = users(100)
  roster[0].distinctCorrect = 1
  roster[1].distinctCorrect = 50
  roster[2].bestFloor = 19
  roster[3].eligible = false
  roster[4].participated = false
  for (let i = 5; i < roster.length; i++) roster[i].bestFloor = 19
  const result = calculateTowerRanks(roster)
  expect(result.population).toBe(98)
  expect(result.tiers.get('00000')).toBe('bronze')
  expect(result.tiers.get('00001')).toBe('silver')
  expect(result.tiers.get('00002')).toBe('gold')
  expect(result.tiers.get('00003')).toBe('unranked')
  expect(result.tiers.get('00004')).toBe('unranked')
  expect([...result.tiers.values()]).not.toContain('platinum')
  expect([...result.tiers.values()]).not.toContain('diamond')
})
test('rejects duplicate users and malformed records', () => {
  const one = users(1)[0]
  expect(() => calculateTowerRanks([one, one])).toThrow()
  expect(() => calculateTowerRanks([{ ...one, bestFloor: -1 }])).toThrow()
})
test('stage mix is one stage 2 and one stage 3 in each pair', () => {
  expect(rankedStagePair(() => 0.1)).toEqual([2, 3])
  expect(rankedStagePair(() => 0.9)).toEqual([3, 2])
})

test('only platinum or diamond peaks seed gold in the immediately following season', () => {
  for (const tier of ['unranked', 'bronze', 'silver', 'gold'] as const) {
    expect(nextSeasonSeed(tier)).toBe('unranked')
  }
  expect(nextSeasonSeed('platinum')).toBe('gold')
  expect(nextSeasonSeed('diamond')).toBe('gold')
  expect(nextSeasonSeed(nextSeasonSeed('diamond'))).toBe('unranked')
})
test('gold seed grants gold without inventing any correct answers or ranked result', () => {
  const row = { ...users(1)[0], participated: false, distinctCorrect: 0, bestFloor: null, achievedAt: null }
  const result = calculateTowerRanks([{ ...row, seededGold: true }])
  expect(result.population).toBe(1)
  expect(result.tiers.get(row.userId)).toBe('gold')
  expect(calculateTowerRanks([row]).tiers.get(row.userId)).toBe('unranked')
  expect(calculateTowerRanks([row]).population).toBe(0)
})
test('normal mode only draws stage 1 and 2', () => {
  expect(normalStagePair(() => 0.1)).toEqual([1, 2])
  expect(normalStagePair(() => 0.9)).toEqual([2, 1])
})

test('free accounts are capped at silver and excluded from competitive population', () => {
  const paid = users(100)
  const free: TowerRankInput = { ...paid[0], userId: 'free', access: 'free', distinctCorrect: 999, bestFloor: 999, seededGold: true }
  const result = calculateTowerRanks([...paid, free])
  expect(result.population).toBe(100)
  expect(result.tiers.get('free')).toBe('silver')
  expect(result.tiers.get('00000')).toBe('diamond')
  expect(calculateTowerRanks([{ ...free, participated: false }]).tiers.get('free')).toBe('unranked')
  expect(calculateTowerRanks([{ ...free, distinctCorrect: 1 }]).tiers.get('free')).toBe('bronze')
  expect(normalStagePairForAccess('free', () => 0.9)).toEqual([1, 1])
  expect(normalStagePairForAccess('verified', () => 0.9)).toEqual([2, 1])
})
