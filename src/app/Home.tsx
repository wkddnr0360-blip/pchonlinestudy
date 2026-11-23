import { ArrowRight, BookOpen, ChevronRight, ClipboardList, Clock3, Repeat2, Infinity, LockKeyhole } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { BookIndex } from '../book/types'
import { db } from '../storage/db'
import { premiumEnabled } from '../premium/client'
import { usePremium } from '../premium/PremiumProvider'
import { TeacherButton } from '../ui/TeacherButton'
import { ReleaseBanner } from './ReleaseBanner'
import { stages } from './stages'

export function Home({ book }: { book: BookIndex }) {
  const { member } = usePremium()
  const answered = useLiveQuery(() => db.attempts.orderBy('no').uniqueKeys(), [], [])
  const pending = useLiveQuery(() => db.reviews.filter((item) => !item.resolved).count(), [], 0)
  const latest = useLiveQuery(() => db.studies.orderBy('updatedAt').last())
  const count = answered.length
  const progress = Math.round(count / book.count * 100)
  return <>
    <ReleaseBanner />
    <div className="hero-grid">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-rings" aria-hidden="true"><i /><i /><i /></div>
        <div className="hero-content">
          <span className="hero-badge"><Infinity size={16} /> 박철한 경찰헌법</span>
          <h1 id="hero-title">헌법의 핵심은 무한회독</h1>
          <p>풀고, 틀리고, 다시 풀며 헌법을 내 것으로.</p>
          <Link className="button hero-button" to={latest ? '/study/' + latest.key : '/stage/1'}>
            {latest ? '이어 풀기' : '학습 시작'} <ArrowRight size={17} />
          </Link>
        </div>
        <TeacherButton stage={3} className="hero-teacher" />
      </section>
      <section className="dashboard-progress" aria-labelledby="progress-title">
        <div className="panel-title">
          <span className="small-icon primary-icon"><BookOpen size={19} /></span>
          <h2 id="progress-title">나의 학습</h2>
        </div>
        <div className="progress-value"><strong>{count.toLocaleString('ko-KR')}</strong><span> / {book.count.toLocaleString('ko-KR')} 문항</span></div>
        <div className="progress-track" role="progressbar" aria-label="전체 학습 진도" aria-valuenow={count} aria-valuemin={0} aria-valuemax={book.count}><div style={{ width: progress + '%' }} /></div>
        <div className="progress-caption"><span>전체 진도</span><strong>{progress}%</strong></div>
        <div className="progress-footer"><Repeat2 size={16} /><span>복습할 오답</span><Link to="/review">{pending}문항 <ChevronRight size={14} /></Link></div>
      </section>
    </div>

    <section className="home-section" aria-labelledby="levels-title">
      <div className="section-heading"><h2 id="levels-title">단계별 학습</h2></div>
      <div className="stage-grid">
        {stages.map((stage) => {
          const total = book.stages[stage.number - 1].parts.reduce((sum, part) => sum + part.count, 0)
          return <article className={'stage-card ' + stage.color} key={stage.number}>
            <Link className="stage-link" to={'/stage/' + stage.number}>
              <span className="tag">{stage.number}단계</span>
              {premiumEnabled && stage.number > 1 && !member?.premium && <span className="tag"><LockKeyhole size={12} /> 유료 이용권</span>}
              <h3>{stage.name}</h3>
              <p>{stage.label}</p>
              <span className="stage-count">{total.toLocaleString('ko-KR')}문항 <ChevronRight size={16} /></span>
            </Link>
            <div className="teacher-orb"><TeacherButton stage={stage.number} /></div>
          </article>
        })}
      </div>
    </section>

    <section className="home-section" aria-labelledby="practice-title">
      <div className="section-heading"><h2 id="practice-title">실전과 복습</h2></div>
      <div className="quick-grid">
        <Link className="quick-card" to="/exam">
          <span className="small-icon primary-icon"><Clock3 size={22} /></span>
          <div><strong>실전 모의고사</strong><span>4지선다 20문항 · 시간 설정</span></div>
          <ChevronRight className="quick-arrow" size={20} />
        </Link>
        <Link className="quick-card" to="/review">
          <span className="small-icon warm-icon"><ClipboardList size={22} /></span>
          <div><strong>오답노트</strong><span>틀린 문제와 미응답 문제 복습</span></div>
          <ChevronRight className="quick-arrow" size={20} />
        </Link>
      </div>
    </section>
  </>
}
