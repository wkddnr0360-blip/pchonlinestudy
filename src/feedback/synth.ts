let context: AudioContext | undefined

export function prepareAudio() {
  try {
    context ??= new AudioContext()
    if (context.state !== 'running' && context.state !== 'closed') void context.resume().catch(() => undefined)
  } catch { /* Keep the app usable when Web Audio is unavailable. */ }
}

interface Note {
  hz: number
  length: number
  gain: number
  at?: number
  slide?: number
  kind?: OscillatorType
}

export function playNotes(notes: Note[]) {
  prepareAudio()
  if (!context || context.state === 'closed') return
  const time = context.currentTime + .004
  for (const note of notes) {
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    const start = time + (note.at ?? 0)
    const end = start + note.length
    oscillator.type = note.kind ?? 'sine'
    oscillator.frequency.setValueAtTime(note.hz, start)
    if (note.slide) oscillator.frequency.exponentialRampToValueAtTime(note.slide, end)
    envelope.gain.setValueAtTime(.0001, start)
    envelope.gain.exponentialRampToValueAtTime(note.gain, start + Math.min(.014, note.length / 4))
    envelope.gain.exponentialRampToValueAtTime(.0001, end)
    oscillator.connect(envelope).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(end + .005)
  }
}
