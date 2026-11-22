import type { Stage } from '../book/types'

export function Teacher({ stage, className = '' }: { stage: Stage; className?: string }) {
  return <span className={'teacher teacher-' + stage + ' ' + className} aria-hidden="true" />
}
