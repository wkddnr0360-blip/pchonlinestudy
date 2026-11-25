import { Teacher } from '../../ui/Teacher'
import type { Stage } from '../../book/types'

export function AccountArtwork({ stage }: { stage: Stage }) {
  return (
    <div className={`ons-account-art ons-account-art-${stage}`} aria-hidden="true">
      <div className="ons-art-grid" />
      <div className="ons-art-halo" />
      <div className="ons-art-platform" />
      <div className="ons-art-pixel ons-art-pixel-bright" />
      <div className="ons-art-pixel ons-art-pixel-small" />
      <Teacher stage={stage} className="ons-account-teacher" />
    </div>
  )
}
