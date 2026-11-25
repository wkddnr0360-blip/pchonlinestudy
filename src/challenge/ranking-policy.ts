/**
 * Proposed season policy for the tower. Pure logic only, not a server authority.
 * Persisted server-verified inputs and a versioned snapshot are required in production.
 */
export type Tier = 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface TowerRankInput {
  userId: string
  /** Current server-validated entitlement; never supplied by the browser. */
  access: 'free' | 'verified'
  /** At least one valid normal-mode submission in the current ranking season. */
  participated: boolean
  /** Server-derived Gold seed from the previous season's valid peak tier. */
  seededGold?: boolean
  distinctCorrect: number
  /** Null when there is no valid finalized ranked run. */
  bestFloor: number | null
  achievedAt: number | null
  eligible: boolean
}

export const initialTowerRules = Object.freeze({
  silverCorrect: 50,
  goldCorrect: 200,
  platinumFloor: 20,
  diamondFloor: 40,
})

export function calculateTowerRanks(inputs: readonly TowerRankInput[]) {
  if (new Set(inputs.map(x => x.userId)).size !== inputs.length) throw new Error('Duplicate participant')
  for (const x of inputs) {
    if (!Number.isSafeInteger(x.distinctCorrect) || x.distinctCorrect < 0
      || (x.bestFloor !== null && (!Number.isSafeInteger(x.bestFloor) || x.bestFloor < 0))
      || (x.achievedAt !== null && (!Number.isSafeInteger(x.achievedAt) || x.achievedAt < 0))
      || (x.bestFloor === null) !== (x.achievedAt === null)) throw new Error('Invalid rank input')
  }
  const active = inputs.filter(x => x.eligible && (x.participated || (x.access === 'verified' && x.seededGold === true)))
  const ranked = active.filter(x => x.access === 'verified')
  const population = ranked.length
  const diamondCap = Math.floor(population / 100)
  const upperCap = Math.floor(population / 10)
  const tiers = new Map<string, Tier>(inputs.map(x => [x.userId, 'unranked']))
  for (const x of active) {
    tiers.set(x.userId, x.access === 'verified' && (x.seededGold === true || x.distinctCorrect >= initialTowerRules.goldCorrect) ? 'gold'
      : x.distinctCorrect >= initialTowerRules.silverCorrect ? 'silver' : 'bronze')
  }
  const candidates = ranked.filter(x => tiers.get(x.userId) === 'gold' && x.bestFloor !== null && x.achievedAt !== null)
    .sort((a, b) => b.bestFloor! - a.bestFloor! || a.achievedAt! - b.achievedAt!
      || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
  let diamond = 0
  let upper = 0
  for (const x of candidates) {
    if (upper >= upperCap || x.bestFloor! < initialTowerRules.platinumFloor) break
    if (diamond < diamondCap && x.bestFloor! >= initialTowerRules.diamondFloor) {
      tiers.set(x.userId, 'diamond')
      diamond++
    } else tiers.set(x.userId, 'platinum')
    upper++
  }
  return { population, diamondCap, upperCap, tiers }
}

/** 50:50 for every completed two-turn block; random order within each block. */
export function rankedStagePair(random: () => number = Math.random): readonly [2 | 3, 2 | 3] {
  return random() < 0.5 ? [2, 3] : [3, 2]
}

/** Only a valid previous-season peak of Platinum/Diamond carries into the next season. */
export function nextSeasonSeed(peak: Tier): 'gold' | 'unranked' {
  return peak === 'platinum' || peak === 'diamond' ? 'gold' : 'unranked'
}

/** Proposed equal mix; normal mode never includes book stage 3. */
export function normalStagePair(random: () => number = Math.random): readonly [1 | 2, 1 | 2] {
  return random() < 0.5 ? [1, 2] : [2, 1]
}

/** Free accounts always receive stage 1; verified accounts receive the normal 1/2 pair. */
export function normalStagePairForAccess(access: TowerRankInput['access'], random: () => number = Math.random): readonly [1 | 2, 1 | 2] {
  return access === 'verified' ? normalStagePair(random) : [1, 1]
}
