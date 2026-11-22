import type { FeedbackPreferences } from './preferences'

let context: AudioContext | undefined
let lastTap = -Infinity

export function prepareAudio() {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume().catch(() => undefined)
  } catch { /* Feedback remains optional when Web Audio is unavailable. */ }
}

function tone(
  frequency: number, offset: number, duration: number, gain: number, type: OscillatorType = 'sine',
) {
  if (!context || context.state === 'closed') return
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  const start = context.currentTime + offset
  oscillator.type = type
  oscillator.frequency.value = frequency
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.009)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.01)
}

export function playTap() {
  if (performance.now() - lastTap < 65) return
  lastTap = performance.now()
  prepareAudio()
  tone(620, 0, 0.047, 0.025)
  tone(1180, 0.002, 0.036, 0.012, 'triangle')
}

function softBell() {
  tone(698.46, 0.025, 0.21, 0.065)
  tone(1046.5, 0.089, 0.27, 0.054)
}

function cheerMelody() {
  tone(587.33, 0.02, 0.11, 0.045, 'triangle')
  tone(783.99, 0.10, 0.17, 0.05)
  tone(987.77, 0.18, 0.23, 0.045)
  tone(1174.66, 0.18, 0.19, 0.022, 'triangle')
}

export function playReward(sound: FeedbackPreferences['reward']) {
  prepareAudio()
  if (sound === 'pixel') {
    tone(523.25, 0.025, 0.11, 0.06, 'triangle')
    tone(659.25, 0.086, 0.13, 0.06, 'triangle')
    tone(880, 0.147, 0.21, 0.07, 'triangle')
    return
  }
  if (sound === 'cheer' && 'speechSynthesis' in window) {
    const voice = window.speechSynthesis.getVoices().find((item) => /^ko(?:-|$)/i.test(item.lang) && item.localService)
    if (voice) {
      const phrase = new SpeechSynthesisUtterance('잘했어요! 한 문제 더!')
      phrase.lang = 'ko-KR'
      phrase.voice = voice
      phrase.rate = 1.04
      phrase.volume = 0.65
      phrase.onerror = (event) => {
        if (event.error !== 'interrupted' && event.error !== 'canceled') cheerMelody()
      }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(phrase)
      return
    }
  }
  if (sound === 'cheer') cheerMelody()
  else softBell()
}
