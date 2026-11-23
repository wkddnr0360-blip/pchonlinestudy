import { playNotes, prepareAudio } from '../feedback/synth'
import { themeFor } from './rules'

export type GameCue = 'correct' | 'missed' | 'clear' | 'finished'

export function playGameCue(stage: number, cue: GameCue) {
  const base = [349.23, 392, 440][themeFor(stage).number - 1]
  if (cue === 'missed' || cue === 'finished') {
    playNotes([
      { hz: base * .75, slide: base * .62, length: .16, gain: .043, kind: 'triangle' },
      { hz: base * .48, at: .08, length: .18, gain: .021 },
    ])
    return
  }
  const steps = cue === 'clear' ? [1, 1.25, 1.5, 2] : [1.25, 1.67]
  playNotes(steps.map((ratio, index) => ({
    hz: base * ratio, length: .14 + index * .04, gain: .054 - index * .006,
    at: index * (cue === 'clear' ? .095 : .05), kind: index === 0 ? 'triangle' : 'sine',
  })))
}

export function createGameMusic() {
  let audio: HTMLAudioElement | undefined
  let currentTrack = 0
  let enabled = true

  return {
    toggle(value: boolean, stage: number, playing: boolean) {
      enabled = value
      if (value && playing) this.play(stage)
      else audio?.pause()
    },
    play(stage: number) {
      if (!enabled) return
      prepareAudio()
      const track = themeFor(stage).number
      if (!audio) {
        audio = new Audio()
        audio.loop = true
        audio.volume = .82
      }
      if (currentTrack !== track) {
        currentTrack = track
        audio.src = import.meta.env.BASE_URL + 'challenge/level-' + track + '.mp3'
      }
      audio.playbackRate = Math.min(1.16, 1 + (stage - 1) * .012)
      void audio.play().catch(() => undefined)
    },
    stop() {
      audio?.pause()
      if (audio) audio.currentTime = 0
    },
  }
}
