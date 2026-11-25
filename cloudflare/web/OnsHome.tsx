import { ArrowRight, Infinity, NotebookPen, TicketCheck, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Stage } from '../../src/book/types'
import type { StudyCatalog, StudyProgress } from '../../shared/study'
import { StageGallery } from '../../src/features/study/StageGallery'
import { StageMascot } from '../../src/features/study/StageMascot'
import { StudyRequestError, studyRequest } from '../../src/features/study/api'
import { reviewHref, stageHref } from '../../src/features/study/navigation'
import { HomeStudySummary, type HomeStudy } from './HomeStudySummary'
import fontLicense from '../../src/ui/licenses/SUIT-OFL.txt?url'
import './home.css'

export function OnsHome() {
  const [study, setStudy] = useState<HomeStudy>()
  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    void Promise.all([
      studyRequest<StudyCatalog>('/study/catalog', options), studyRequest<{ progress: StudyProgress }>('/study/progress', options),
    ]).then(([catalog, { progress }]) => setStudy({ catalog, progress })).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setStudy(error instanceof StudyRequestError && error.status === 401 ? 'sign-in' : 'unavailable')
    })
    return () => controller.abort()
  }, [])

  const counts: Partial<Record<Stage, number>> = {}
  const catalog = typeof study === 'object' ? study.catalog : undefined
  for (const { stage } of catalog?.questions ?? []) counts[stage] = (counts[stage] ?? 0) + 1
  const lastNo = typeof study === 'object' ? study.progress.lastNo : null
  const recent = catalog?.questions.find(({ no }) => no === lastNo)

  return <main className="ons-home ons-container">
    <div className="ons-home-dashboard">
      <section className="ons-home-hero" aria-labelledby="ons-home-title">
        <div className="ons-home-hero-copy">
          <p className="ons-home-eyebrow"><Infinity size={17} aria-hidden="true" /> 박철한 경찰헌법</p>
          <h1 id="ons-home-title">헌법의 핵심은 무한회독</h1>
          <p className="ons-home-subtitle">풀고, 틀리고, 다시 풀며 헌법을 내 것으로.</p>
          <a className="ons-button ons-home-start" href={stageHref(recent?.stage ?? 1)}>
            {recent ? '최근 학습' : '학습 시작'}<ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <StageMascot stage={1} className="ons-home-hero-mascot" />
      </section>
      <HomeStudySummary study={study} />
    </div>
    <StageGallery verified={catalog?.access.bookVerified ?? false} counts={counts} />
    <section className="ons-home-activity" aria-labelledby="ons-activity-heading">
      <h2 id="ons-activity-heading">실전과 복습</h2>
      <div className="ons-home-shortcuts">
        <a className="ons-home-row" href="/exam">
          <span className="ons-home-row-icon"><Timer size={22} aria-hidden="true" /></span>
          <span><strong>실전 모의고사</strong><small>4지선다 20문항 · 기본 20분</small></span><ArrowRight size={19} aria-hidden="true" />
        </a>
        <a className="ons-home-row" href={reviewHref}>
          <span className="ons-home-row-icon ons-home-row-gold"><NotebookPen size={22} aria-hidden="true" /></span>
          <span><strong>오답노트</strong><small>틀린 문제 다시 풀기</small></span><ArrowRight size={19} aria-hidden="true" />
        </a>
      </div>
    </section>
    <a href="/account" className="ons-home-access"><TicketCheck size={19} aria-hidden="true" /> 교재 인증 및 황금 티켓 <ArrowRight size={16} aria-hidden="true" /></a>
    <footer className="ons-home-footer"><a href="/terms">이용약관</a><a href="/privacy">개인정보 처리방침</a><a href={fontLicense}>글꼴 라이선스</a></footer>
  </main>
}
