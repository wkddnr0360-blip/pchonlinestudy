import { Circle, X } from 'lucide-react'
import type { Ox } from '../book/types'

export function OxButtons({ selected, onAnswer, disabled }: {
  selected?: Ox; onAnswer: (answer: Ox) => void; disabled?: boolean
}) {
  return <div className="ox-buttons" aria-label="정오 선택">
    <button className="ox-option choose-o" aria-label="O 옳다" aria-pressed={selected === 'O'} disabled={disabled || !!selected} onClick={() => onAnswer('O')}><Circle size={24} /> O</button>
    <button className="ox-option choose-x" aria-label="X 틀리다" aria-pressed={selected === 'X'} disabled={disabled || !!selected} onClick={() => onAnswer('X')}><X size={25} /> X</button>
  </div>
}
