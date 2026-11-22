import { useEffect, useState } from 'react'
import { Play, Volume2 } from 'lucide-react'
import { ErrorNotice } from '../ui/Controls'
import { playReward } from './audio'
import { rewardOptions, saveFeedback, useFeedbackPreferences, type FeedbackPreferences } from './preferences'

export function FeedbackSettings() {
  const saved = useFeedbackPreferences()
  const [pending, setPending] = useState<Partial<FeedbackPreferences>>({})
  const [error, setError] = useState(false)
  const preferences = { ...saved, ...pending }

  useEffect(() => {
    setPending((current) => {
      const entries = Object.entries(current)
      const remaining = entries.filter(([key, value]) => saved[key as keyof FeedbackPreferences] !== value)
      return remaining.length === entries.length ? current : Object.fromEntries(remaining)
    })
  }, [saved])

  async function update<Key extends keyof FeedbackPreferences>(key: Key, value: FeedbackPreferences[Key]) {
    setPending((current) => ({ ...current, [key]: value }))
    setError(false)
    try { await saveFeedback({ [key]: value }) }
    catch {
      setPending((current) => {
        if (current[key] !== value) return current
        const remaining = { ...current }
        delete remaining[key]
        return remaining
      })
      setError(true)
    }
  }

  return <section className="surface settings-card">
    <h2><Volume2 size={21} /> 소리와 진동</h2>
    <div className="feedback-settings">
      <label><span>터치 효과음</span><input type="checkbox" role="switch" checked={preferences.tap}
        onChange={(event) => void update('tap', event.target.checked)} /></label>
      <label><span>터치 진동 <small>지원되는 기기</small></span><input type="checkbox" role="switch" checked={preferences.haptics}
        onChange={(event) => void update('haptics', event.target.checked)} /></label>
      <label><span>재미 모드 <small>정답을 맞히면 재생</small></span><input type="checkbox" role="switch" checked={preferences.fun}
        onChange={(event) => void update('fun', event.target.checked)} /></label>
    </div>
    <div className="sound-select">
      <label><span className="visually-hidden">정답 효과음</span><select aria-label="정답 효과음" value={preferences.reward}
        onChange={(event) => void update('reward', event.target.value as FeedbackPreferences['reward'])}>
        {rewardOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button type="button" className="button secondary" data-quiet onClick={() => playReward(preferences.reward)}><Play size={16} /> 미리 듣기</button>
    </div>
    <p className="settings-help">한국어 기기 음성이 없으면 짧은 응원 멜로디를 재생해요.</p>
    {error && <ErrorNotice message="효과음 설정을 저장하지 못했습니다." />}
  </section>
}
