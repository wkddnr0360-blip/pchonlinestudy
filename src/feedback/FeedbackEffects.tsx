import { useEffect } from 'react'
import { playTap, prepareAudio } from './audio'
import { useFeedbackPreferences } from './preferences'

export function FeedbackEffects() {
  const { haptics, tap, fun, reward } = useFeedbackPreferences()

  useEffect(() => {
    if (reward === 'cheer') window.speechSynthesis?.getVoices()
  }, [reward])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!event.isTrusted || !(event.target instanceof Element)) return
      const control = event.target.closest('button, a[href], summary, select, [role="switch"]')
      if (!control || control.matches(':disabled,[aria-disabled="true"]') || control.closest('[data-quiet]')) return
      if (tap) playTap()
      else if (fun) prepareAudio()
      if (haptics && event.detail !== 0) navigator.vibrate?.(7)
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [tap, haptics, fun])

  return null
}
