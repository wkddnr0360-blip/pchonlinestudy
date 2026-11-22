import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'

export function ExamClock({ deadline, onExpire }: { deadline: number; onExpire: (expired: boolean) => void }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))

  useEffect(() => {
    function sync() {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setSeconds(remaining)
      if (remaining === 0) onExpire(true)
    }
    const interval = window.setInterval(sync, 250)
    document.addEventListener('visibilitychange', sync)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', sync) }
  }, [deadline, onExpire])

  const displayTime = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  return <span className={seconds < 60 ? 'timer urgent' : 'timer'} aria-label="남은 시간" role="timer">
    <Clock3 size={19} />{displayTime}
  </span>
}
