import { useState } from 'react'
import { ChevronRight, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { isStageOpen } from '../book/publicPreview'
import type { BookIndex } from '../book/types'
import { Modal } from '../ui/Controls'
import { Teacher } from '../ui/Teacher'
import { TeacherButton } from '../ui/TeacherButton'
import { stages } from './stages'

export function StageCards({ book }: { book: BookIndex }) {
  const [preview, setPreview] = useState<(typeof stages)[number]>()
  const closePreview = () => setPreview(undefined)

  return <section className="home-section" aria-labelledby="levels-title">
    <div className="section-heading"><h2 id="levels-title">단계별 학습</h2></div>
    <div className="stage-grid">
      {stages.map((stage) => {
        if (!isStageOpen(stage.number)) return <article className={'stage-card ' + stage.color} key={stage.number}>
          <button type="button" className="stage-link stage-preview-trigger" aria-haspopup="dialog"
            onClick={() => setPreview(stage)}>
            <span className="tag">{stage.number}단계</span>
            <span className="stage-title">{stage.name}</span>
            <span className="stage-description">{stage.label}</span>
            <span className="stage-count"><LockKeyhole size={14} aria-hidden="true" /> 정식 오픈 예정</span>
            <span className="teacher-orb" aria-hidden="true">
              <span className="teacher-control"><Teacher stage={stage.number} /></span>
            </span>
          </button>
        </article>

        const total = book.stages.find((item) => item.stage === stage.number)?.parts.reduce((sum, part) => sum + part.count, 0) ?? 0
        return <article className={'stage-card ' + stage.color} key={stage.number}>
          <Link className="stage-link" to={'/stage/' + stage.number}>
            <span className="tag">{stage.number}단계</span>
            <h3 className="stage-title">{stage.name}</h3>
            <p className="stage-description">{stage.label}</p>
            <span className="stage-count">{total.toLocaleString('ko-KR')}문항 <ChevronRight size={16} /></span>
          </Link>
          <div className="teacher-orb"><TeacherButton stage={stage.number} /></div>
        </article>
      })}
    </div>
    {preview && <Modal title="정식오픈을 기다려주세요!" close={closePreview}>
      <div className={'stage-preview-art ' + preview.color}>
        <TeacherButton stage={preview.number} playOnMount />
      </div>
      <button type="button" className="button primary full" onClick={closePreview}>확인</button>
    </Modal>}
  </section>
}
