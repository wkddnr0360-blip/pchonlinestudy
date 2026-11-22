import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ListOrdered, Play, Shuffle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { stages, validStage } from '../app/stages'
import { getQuestions } from '../book/catalog'
import type { BookIndex, Scope } from '../book/types'
import { db } from '../storage/db'
import { ErrorNotice, Modal } from '../ui/Controls'
import { TeacherButton } from '../ui/TeacherButton'
import { scopeKey, shuffle } from './selection'

interface Selection {
  scope: Scope
  label: string
  count: number
}

function StartStudy({ book, selection, close }: { book: BookIndex; selection: Selection; close: () => void }) {
  const { scope, count, label } = selection
  const key = scopeKey(scope.stage, scope.part, scope.chapterKey, scope.section)
  const existing = useLiveQuery(() => db.studies.get(key), [key])
  const [mode, setMode] = useState<'order' | 'random'>('order')
  const [length, setLength] = useState(String(Math.min(10, count)))
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function start(event: FormEvent) {
    event.preventDefault()
    if (waiting) return
    const size = Number(length)
    if (mode === 'random' && (!Number.isInteger(size) || size < 1 || size > count)) return
    setWaiting(true)
    setError('')
    try {
      const available = await getQuestions(book, scope)
      if (!available.length) throw new Error('학습할 문제가 없습니다.')
      const numbers = (mode === 'random' ? shuffle(available).slice(0, size) : available).map((question) => question.no)
      await db.studies.put({
        key, id: crypto.randomUUID(), version: book.version, scope, mode, numbers,
        position: 0, updatedAt: Date.now(),
      })
      navigate('/study/' + key)
    } catch {
      setError('문제를 불러오거나 학습 기록을 저장하지 못했습니다.')
    } finally {
      setWaiting(false)
    }
  }

  return <Modal title="학습 방식 선택" close={close}>
    <p className="dialog-description">{label} · {count.toLocaleString('ko-KR')}문항</p>
    {existing && existing.version === book.version && <Link className="resume-link" to={'/study/' + key}>
      <Play size={17} /> {existing.position + 1}번째부터 이어 풀기 <ArrowRight size={17} />
    </Link>}
    <form onSubmit={start}>
      <div className="mode-picker" role="group" aria-label="학습 방식">
        <button type="button" aria-pressed={mode === 'order'} onClick={() => setMode('order')}><ListOrdered /> 순서대로</button>
        <button type="button" aria-pressed={mode === 'random'} onClick={() => setMode('random')}><Shuffle /> 랜덤</button>
      </div>
      {mode === 'random' && <div className="field">
        <label htmlFor="sample-length">풀 문제 수</label>
        <input id="sample-length" type="number" min={1} max={count} required inputMode="numeric" value={length}
          onChange={(event) => setLength(event.target.value)} />
      </div>}
      {error && <ErrorNotice message={error} />}
      <button className="button primary full" disabled={waiting}>{waiting ? '문제 불러오는 중' : existing ? '새로 풀기' : '문제 풀기'} <ArrowRight size={18} /></button>
    </form>
  </Modal>
}

export default function StagePage({ book }: { book: BookIndex }) {
  const { stage } = useParams()
  const [selection, setSelection] = useState<Selection>()
  if (!validStage(stage)) return <ErrorNotice message="단계를 찾을 수 없습니다." />
  const model = stages[Number(stage) - 1]
  const data = book.stages[Number(stage) - 1]
  const stageScope = { stage: model.number }
  const stageCount = data.parts.reduce((sum, part) => sum + part.count, 0)

  return <>
    <Link className="back-link" to="/"><ArrowLeft size={17} /> 학습 홈</Link>
    <section className={'stage-banner ' + model.color}>
      <div>
        <span className="tag">{stage}단계</span>
        <h1>{model.name}</h1>
        <p>{model.label} · {stageCount.toLocaleString('ko-KR')}문항</p>
        <button className="button primary" onClick={() => setSelection({ scope: stageScope, label: stage + '단계 전체', count: stageCount })}>
          <Play size={17} /> 전체 풀기
        </button>
      </div>
      <TeacherButton stage={model.number} className="banner-teacher welcome-motion" />
    </section>
    <section className="topic-section" aria-labelledby="topic-title">
      <div className="section-heading"><h2 id="topic-title">교재 목차</h2></div>
      {data.parts.map((part) => {
        const partScope = { ...stageScope, part: part.number }
        return <details className="toc-part" key={part.number} open>
          <summary><BookOpen size={20} /><strong>{part.label}</strong><span>{part.count.toLocaleString('ko-KR')}문항</span><ChevronDown size={17} /></summary>
          <div className="toc-chapters">
            <button className="topic-row all-topic" onClick={() => setSelection({ scope: partScope, label: part.label, count: part.count })}>
              <strong>편 전체 풀기</strong><ArrowRight size={16} />
            </button>
            {part.chapters.map((chapter) => {
              const chapterScope = { ...partScope, chapterKey: chapter.key }
              return <div className="topic-chapter" key={chapter.key}>
                <button className="topic-row" onClick={() => setSelection({ scope: chapterScope, label: chapter.label, count: chapter.count })}>
                  <strong>{chapter.label}</strong><span>{chapter.count}문항</span><ArrowRight size={16} />
                </button>
                {chapter.sections.map((section) => <button className="topic-row subtopic" key={section.number}
                  onClick={() => setSelection({ scope: { ...chapterScope, section: section.number }, label: section.label, count: section.count })}>
                  <strong>{section.label}</strong><span>{section.count}문항</span><ArrowRight size={16} />
                </button>)}
              </div>
            })}
          </div>
        </details>
      })}
    </section>
    {selection && <StartStudy book={book} selection={selection} close={() => setSelection(undefined)} />}
  </>
}
