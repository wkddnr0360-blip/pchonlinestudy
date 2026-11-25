import type { Stage } from '../../book/types'

export function StageArtwork({ stage, reaction = false, className = '' }: { stage: Stage; reaction?: boolean; className?: string }) {
  return <div className={`ons-stage-art ${className}`} data-stage={stage} aria-hidden="true">
    <span className="ons-stage-scene" />
    <span className="ons-stage-teacher" data-reaction={reaction} />
  </div>
}
