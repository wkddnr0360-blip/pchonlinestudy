import { useEffect, useRef, useState } from 'react'
import type { Stage } from '../book/types'
import { Teacher } from './Teacher'

const reactions = {
  1: { name: '웃음', label: '살짝 웃어요' },
  2: { name: '활짝 웃는 응원', label: '활짝 웃으며 응원해요' },
  3: { name: '불꽃 응원', label: '불꽃처럼 힘차게 응원해요' },
} satisfies Record<Stage, { name: string; label: string }>

export function TeacherButton({ stage, className = '' }: { stage: Stage; className?: string }) {
  const [reaction, setReaction] = useState(0)
  const [active, setActive] = useState(false)
  const timer = useRef<number>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function playReaction() {
    window.clearTimeout(timer.current)
    setReaction((current) => current + 1)
    setActive(true)
    timer.current = window.setTimeout(() => setActive(false), 1250)
  }

  return <button type="button" className={'teacher-control ' + className}
    aria-label={stage + '단계 철한쌤 ' + reactions[stage].name + ' 모션'} onClick={playReaction}>
    <Teacher stage={stage} key={reaction} className={active ? 'teacher-reacting' : ''} />
    {active && <span key={'pixels-' + reaction} className={'teacher-particles teacher-particles-' + stage} aria-hidden="true">
      <i /><i /><i />
    </span>}
    <span className="visually-hidden" role="status">{active ? reactions[stage].label : ''}</span>
  </button>
}
