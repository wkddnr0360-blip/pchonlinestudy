import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'

export function ChallengeTimer({ until, duration, onExpire }: {
  until: number; duration: number; onExpire: () => void
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, until - Date.now()))

  useEffect(() => {
    const tick = () => {
      const pending = Math.max(0, until - Date.now())
      setRemaining(pending)
      if (pending === 0) onExpire()
    }
    const timer = window.setInterval(tick, 100)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [until, onExpire])

  const seconds = Math.ceil(remaining / 1000)
  return <div className={'challenge-timer ' + (seconds <= 4 ? 'urgent' : '')} role="timer" aria-label="문제 제한 시간">
    <Clock3 size={18} /><span>{seconds}초</span>
    <div aria-hidden="true"><i style={{ width: remaining / duration * 100 + '%' }} /></div>
  </div>
}
