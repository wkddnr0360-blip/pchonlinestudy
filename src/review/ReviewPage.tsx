import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Check, ChevronDown, ClipboardList, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { BookIndex } from '../book/types'
import { isStageOpen } from '../book/publicPreview'
import { db } from '../storage/db'
import { unifyReviews } from '../storage/reviews'
import { ErrorNotice, Loading, ParagraphHeading } from '../ui/Controls'
import { ReviewDetail } from './ReviewDetail'
import { groupReviews, reviewChapters } from './reviewOrder'

export default function ReviewPage({ book }: { book: BookIndex }) {
  const items = useLiveQuery(async () => unifyReviews(await db.reviews.toArray()))
  const [stage, setStage] = useState('')
  const [chapter, setChapter] = useState('')
  const [completed, setCompleted] = useState(false)
  const [expanded, setExpanded] = useState<string>()
  const [error, setError] = useState('')
  const chapters = reviewChapters(book).filter((entry) => !stage || String(entry.stage) === stage)
  const filtered = items?.filter((item) => isStageOpen(item.stage) && item.resolved === completed
    && (!stage || String(item.stage) === stage) && (!chapter || item.chapterKey === chapter))
  const groups = filtered ? groupReviews(filtered, chapters) : undefined

  function resolve(no: number) {
    void db.reviews.where('no').equals(no).modify({ resolved: !completed }).catch(() => setError('복습 상태를 저장하지 못했습니다.'))
  }

  return <>
    <ParagraphHeading title="오답노트" description="틀린 문제와 미응답 문제를 모아서 다시 풀어요." />
    <div className="review-filter">
      <div className="segmented" role="group" aria-label="복습 상태">
        <button aria-pressed={!completed} onClick={() => { setCompleted(false); setExpanded(undefined) }}>복습할 문제</button>
        <button aria-pressed={completed} onClick={() => { setCompleted(true); setExpanded(undefined) }}>복습 완료</button>
      </div>
      <label><span className="visually-hidden">단계</span><select value={stage} onChange={(event) => {
        setStage(event.target.value)
        setChapter('')
      }}><option value="">모든 단계</option>{book.stages.map(({ stage: value }) => <option key={value} value={value}>{value}단계</option>)}</select></label>
      <label><span className="visually-hidden">목차</span><select value={chapter} onChange={(event) => setChapter(event.target.value)}>
        <option value="">모든 목차</option>
        {chapters.map((entry) => <option key={entry.key} value={entry.key}>{stage ? '' : entry.stage + '단계 · '}{entry.label}</option>)}
      </select></label>
    </div>
    {error && <ErrorNotice message={error} />}
    {!filtered ? <Loading /> : filtered.length === 0
      ? <section className="center-card empty-state"><span className="small-icon warm-icon"><ClipboardList size={26} /></span>
        <h2>{completed ? '완료한 복습이 없어요.' : '복습할 문제가 없어요.'}</h2>
        <Link className="button secondary" to="/">학습 홈 <ArrowRight size={16} /></Link>
      </section>
      : <section aria-label="오답 목록" className="review-list">
        {groups?.map((group) => <section className="review-chapter" aria-label={group.stage + '단계 ' + group.label} key={group.key}>
          <header className="review-chapter-heading">
            <div><p>{group.stage}단계{group.part && ' · ' + group.part}</p><h2>{group.label}</h2></div>
            <span className="tag">{group.items.length.toLocaleString('ko-KR')}문항</span>
          </header>
          {group.items.map((item) => <article className="result-entry" key={item.id}>
            <button className="topic-row" aria-expanded={expanded === item.id}
              onClick={() => setExpanded(expanded === item.id ? undefined : item.id)}>
              <strong>교재 {item.no.toLocaleString('ko-KR')}번</strong>
              <ChevronDown size={18} />
            </button>
            {expanded === item.id && <div className="review-body">
              <ReviewDetail key={item.id} book={book} item={item} />
              <button className="button secondary" onClick={() => resolve(item.no)}>
                {completed ? <RotateCcw size={17} /> : <Check size={17} />}{completed ? '다시 복습할 문제로' : '복습 완료 표시'}
              </button>
            </div>}
          </article>)}
        </section>)}
      </section>}
  </>
}
