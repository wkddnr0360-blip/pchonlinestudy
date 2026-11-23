import type { FeedbackPreferences } from './preferences'
import { playNotes, prepareAudio } from './synth'

export { prepareAudio }

let lastTap = -Infinity

export function playTap() {
  if (performance.now() - lastTap < 65) return
  lastTap = performance.now()
  playNotes([
    { hz: 230, slide: 140, length: .062, gain: .035, kind: 'triangle' },
    { hz: 410, slide: 320, at: .011, length: .032, gain: .013 },
  ])
}

function cheerMelody() {
  playNotes([
    { hz: 392, length: .12, gain: .037, kind: 'triangle' },
    { hz: 493.88, at: .08, length: .17, gain: .046 },
    { hz: 659.25, at: .18, length: .3, gain: .044 },
    { hz: 293.66, at: .18, length: .24, gain: .018 },
  ])
}

export function playReward(sound: FeedbackPreferences['reward']) {
  if (sound === 'pixel') {
    playNotes([
      { hz: 392, slide: 455, length: .086, gain: .039, kind: 'triangle' },
      { hz: 523.25, at: .065, length: .13, gain: .046, kind: 'triangle' },
      { hz: 783.99, at: .145, length: .24, gain: .039 },
    ])
    return
  }
  if (sound === 'cheer') {
    const voice = window.speechSynthesis?.getVoices().find((entry) => /^ko(?:-|$)/i.test(entry.lang) && entry.localService)
    if (!voice) {
      cheerMelody()
      return
    }
    const phrase = new SpeechSynthesisUtterance('잘했어요! 한 문제 더!')
    phrase.lang = 'ko-KR'
    phrase.voice = voice
    phrase.rate = 1.04
    phrase.volume = .65
    phrase.onerror = (event) => {
      if (event.error !== 'interrupted' && event.error !== 'canceled') cheerMelody()
    }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(phrase)
    return
  }
  playNotes([
    { hz: 440, length: .21, gain: .045 },
    { hz: 659.25, at: .075, length: .28, gain: .044 },
    { hz: 880, at: .105, length: .2, gain: .013 },
  ])
}
