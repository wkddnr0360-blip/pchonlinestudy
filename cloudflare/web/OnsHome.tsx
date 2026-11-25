import { ArrowRight, BookOpen, NotebookPen, RotateCcw, TicketCheck, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Stage } from '../../src/book/types'
import type { StudyCatalog, StudyProgress } from '../../shared/study'
import { StageGallery } from '../../src/features/study/StageGallery'
import { studyRequest } from '../../src/features/study/api'
import { reviewHref } from '../../src/features/study/navigation'
import fontLicense from '../../src/ui/licenses/SUIT-OFL.txt?url'
import './home.css'

export function OnsHome() {
  const [study, setStudy] = useState<{ catalog: StudyCatalog; progress: StudyProgress }>()
  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    void Promise.all([
      studyRequest<StudyCatalog>('/study/catalog', options), studyRequest<{ progress: StudyProgress }>('/study/progress', options),
    ]).then(([catalog, { progress }]) => setStudy({ catalog, progress })).catch(() => {})
    return () => controller.abort()
  }, [])

  const counts: Partial<Record<Stage, number>> = {}
  for (const { stage } of study?.catalog.questions ?? []) counts[stage] = (counts[stage] ?? 0) + 1
  const recent = study?.progress.lastNo && study.catalog.questions.find(({ no }) => no === study.progress.lastNo)

  return <main className="ons-home ons-container">
    <header className="ons-home-intro">
      <p><BookOpen size={17} aria-hidden="true" /> 경찰헌법 OX</p>
      <h1>헌법의 핵심은<br className="ons-home-break" /> 무한회독</h1>
      <p className="ons-home-subtitle">교재의 1단계부터 고득점 도전까지.</p>
    </header>
    <StageGallery verified={study?.catalog.access.bookVerified ?? false} counts={counts} />
    <section className="ons-home-activity" aria-labelledby="ons-activity-heading">
      <h2 id="ons-activity-heading">실전과 복습</h2>
      <div className="ons-home-shortcuts">
        {recent && <a className="ons-home-row" href={`/study?stage=${recent.stage}`}>
          <span className="ons-home-row-icon ons-home-row-green"><RotateCcw size={22} aria-hidden="true" /></span>
          <span><strong>이어 풀기</strong><small>교재 {recent.no}번</small></span><ArrowRight size={19} aria-hidden="true" />
        </a>}
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
    <footer className="ons-home-footer"><a href={fontLicense}>글꼴 라이선스</a></footer>
  </main>
}
