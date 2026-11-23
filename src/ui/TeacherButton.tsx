import { useEffect, useRef, useState } from 'react'
import type { Stage } from '../book/types'
import { Teacher } from './Teacher'

const reactions = {
  1: { name: '웃음', label: '살짝 웃어요' },
  2: { name: '활짝 웃는 응원', label: '활짝 웃으며 응원해요' },
  3: { name: '불꽃 응원', label: '불꽃처럼 힘차게 응원해요' },
} satisfies Record<Stage, { name: string; label: string }>

export function TeacherButton({ stage, className = '', playOnMount = false }: {
  stage: Stage
  className?: string
  playOnMount?: boolean
}) {
  const [reaction, setReaction] = useState(0)
  const [active, setActive] = useState(playOnMount)
  const [reactionPoseReady, setReactionPoseReady] = useState(false)
  const timer = useRef<number>(undefined)

  useEffect(() => {
    if (playOnMount) timer.current = window.setTimeout(() => setActive(false), 1250)
    return () => window.clearTimeout(timer.current)
  }, [playOnMount])

  useEffect(() => {
    if (!active || reactionPoseReady) return
    const image = new Image()
    image.onload = () => setReactionPoseReady(true)
    image.src = import.meta.env.BASE_URL + 'characters/teacher-reactions.webp'
    return () => { image.onload = null }
  }, [active, reactionPoseReady])

  function playReaction() {
    window.clearTimeout(timer.current)
    setReaction((current) => current + 1)
    setActive(true)
    timer.current = window.setTimeout(() => setActive(false), 1250)
  }

  return <button type="button" className={'teacher-control ' + className}
    aria-label={stage + '단계 철한쌤 ' + reactions[stage].name + ' 모션'} onClick={playReaction}>
    <Teacher stage={stage} key={reaction}
      className={active ? 'teacher-reacting' + (reactionPoseReady ? ' teacher-reaction-pose' : '') : ''} />
    {active && <span key={'pixels-' + reaction} className={'teacher-particles teacher-particles-' + stage} aria-hidden="true">
      <i /><i /><i />
    </span>}
    <span className="visually-hidden" role="status">{active ? reactions[stage].label : ''}</span>
  </button>
}
