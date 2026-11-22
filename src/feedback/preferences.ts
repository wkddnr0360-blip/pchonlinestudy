import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'

export const rewardOptions = [
  { id: 'chime', label: '소프트 벨' },
  { id: 'pixel', label: '픽셀 콤보' },
  { id: 'cheer', label: '응원 음성' },
] as const

type Reward = typeof rewardOptions[number]['id']
export interface FeedbackPreferences {
  tap: boolean
  haptics: boolean
  fun: boolean
  reward: Reward
}

const defaults: FeedbackPreferences = { tap: true, haptics: true, fun: false, reward: 'chime' }

function parsePreferences(json?: string): FeedbackPreferences {
  if (!json) return defaults
  try {
    const parsed = JSON.parse(json)
    return {
      tap: typeof parsed.tap === 'boolean' ? parsed.tap : defaults.tap,
      haptics: typeof parsed.haptics === 'boolean' ? parsed.haptics : defaults.haptics,
      fun: typeof parsed.fun === 'boolean' ? parsed.fun : defaults.fun,
      reward: rewardOptions.find(({ id }) => id === parsed.reward)?.id ?? defaults.reward,
    }
  } catch { return defaults }
}

export function useFeedbackPreferences() {
  return useLiveQuery(async () => parsePreferences((await db.settings.get('feedback'))?.value), [], defaults)
}

export function saveFeedback(change: Partial<FeedbackPreferences>) {
  return db.transaction('rw', db.settings, async () => {
    const current = parsePreferences((await db.settings.get('feedback'))?.value)
    await db.settings.put({ key: 'feedback', value: JSON.stringify({ ...current, ...change }) })
  })
}
