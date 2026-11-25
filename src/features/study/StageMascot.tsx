import { useEffect, useRef, useState } from 'react'
import type { Stage } from '../../book/types'
import { StageArtwork } from './StageArtwork'

const reactions = {
  1: { name: '웃음', message: '철한쌤이 살짝 웃어요.' },
  2: { name: '활짝 웃는 응원', message: '철한쌤이 활짝 웃으며 응원해요.' },
  3: { name: '불꽃 응원', message: '철한쌤이 불꽃처럼 힘차게 응원해요.' },
}

export function StageMascot({ stage, className = '', playOnMount = false }: {
  stage: Stage
  className?: string
  playOnMount?: boolean
}) {
  const [reaction, setReaction] = useState(playOnMount ? 1 : 0)
  const [active, setActive] = useState(playOnMount)
  const timer = useRef<number>(undefined)
  const { name, message } = reactions[stage]

  useEffect(() => {
    if (playOnMount) timer.current = window.setTimeout(() => setActive(false), 1150)
    return () => window.clearTimeout(timer.current)
  }, [playOnMount])

  function play() {
    window.clearTimeout(timer.current)
    setReaction((current) => current + 1)
    setActive(true)
    timer.current = window.setTimeout(() => setActive(false), 1150)
  }

  return <button type="button" className={`ons-mascot ${className}`} data-stage={stage}
    aria-label={`${stage}단계 철한쌤 ${name} 모션`} onClick={play}>
    <StageArtwork stage={stage} reaction={active} />
    {active && <span className="ons-mascot-pixels" aria-hidden="true" key={reaction}><i /><i /><i /></span>}
    <span className="ons-visually-hidden" role="status">{active ? message : ''}</span>
  </button>
}
