import { BookOpen, ChevronRight, Repeat2 } from 'lucide-react'
import type { StudyCatalog, StudyProgress } from '../../shared/study'
import { reviewHref } from '../../src/features/study/navigation'

export type HomeStudy = { catalog: StudyCatalog; progress: StudyProgress } | 'sign-in' | 'unavailable'

const number = new Intl.NumberFormat('ko-KR')

export function HomeStudySummary({ study }: { study: HomeStudy | undefined }) {
  const total = typeof study === 'object' ? study.catalog.questions.length : 0
  const attempted = typeof study === 'object' ? Math.min(study.progress.attempted, total) : 0
  return <section className="ons-home-progress" aria-labelledby="ons-home-progress-heading">
    <h2 id="ons-home-progress-heading"><span className="ons-home-row-icon"><BookOpen size={20} aria-hidden="true" /></span>나의 학습</h2>
    {total > 0 ? <div className="ons-home-progress-body">
      <p className="ons-home-count"><strong>{number.format(attempted)}</strong> / {number.format(total)}문항</p>
      <progress aria-label="전체 학습 진도" value={attempted} max={total} />
      <p className="ons-home-progress-caption"><span>전체 진도</span><strong>{Math.round(attempted / total * 100)}%</strong></p>
    </div> : <div className="ons-home-progress-body ons-home-progress-empty">
      <p>{study === 'sign-in' ? '로그인하면 학습 진도를 확인할 수 있어요.'
        : study === 'unavailable' ? '지금은 학습 진도를 불러올 수 없어요.'
        : study ? '교재 문항을 준비하고 있어요.' : '학습 진도를 확인하고 있어요.'}</p>
      {study === 'sign-in' && <a href="/account">로그인 <ChevronRight size={16} aria-hidden="true" /></a>}
    </div>}
    <a href={reviewHref} className="ons-home-review"><Repeat2 size={18} aria-hidden="true" />복습할 오답<ChevronRight size={16} aria-hidden="true" /></a>
  </section>
}
