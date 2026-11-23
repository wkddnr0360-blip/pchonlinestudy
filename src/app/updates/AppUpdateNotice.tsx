import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { activeExam } from '../../storage/exams'
import { useAppUpdate } from './useAppUpdate'

export function AppUpdateNotice() {
  const { available, busy, message, applyUpdate } = useAppUpdate()
  const { pathname } = useLocation()
  const exam = useLiveQuery(async () => available ? (await activeExam()) ?? null : null, [available])
  if (!available) return null

  const studying = pathname.startsWith('/study/') || pathname === '/challenge'
  const takingExam = !!exam
  const canApply = !studying && !takingExam && exam !== undefined

  return <aside className="release-notice" aria-label="앱 업데이트">
    <RefreshCw size={18} aria-hidden="true" />
    <div aria-live="polite">
      <strong>새 버전 준비 완료</strong>
      {message ? <span>{message}</span> : studying ? <span>학습 화면을 나간 뒤 적용할 수 있어요.</span>
        : takingExam ? <span>모의고사를 마친 뒤 적용할 수 있어요.</span> : null}
    </div>
    <button type="button" className="button secondary" disabled={!canApply || busy}
      onClick={() => void applyUpdate()}>{busy ? '적용 중' : '업데이트 적용'}</button>
  </aside>
}
