import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, ClipboardCheck, Clock3, ListChecks, Play } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getQuestions } from '../book/catalog'
import type { BookIndex } from '../book/types'
import { db } from '../storage/db'
import { activeExam, startExam } from '../storage/exams'
import { ErrorNotice, ParagraphHeading } from '../ui/Controls'
import { DEFAULT_MINUTES, EXAM_COUNT, generateExam } from './generate'

export default function ExamLobby({ book }: { book: BookIndex }) {
  const running = useLiveQuery(activeExam)
  const recent = useLiveQuery(() => db.exams.orderBy('startedAt').reverse().filter((exam) => exam.status === 'submitted').limit(5).toArray(), [], [])
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function start(event: FormEvent) {
    event.preventDefault()
    const duration = Number(minutes)
    if (!Number.isSafeInteger(duration) || duration < 1 || !Number.isSafeInteger(Date.now() + duration * 60000)) {
      setError('제한 시간을 1분 이상의 정수로 입력해 주세요.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const existing = await activeExam()
      const exam = existing ?? await startExam(generateExam(await getQuestions(book)), duration, book.version)
      navigate('/exam/' + exam.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '모의고사를 시작하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="narrow-page">
    <ParagraphHeading title="실전 모의고사" description="세 단계의 교재 지문을 섞어 실전처럼 풀어보세요." />
    <section className="surface exam-setup">
      <div className="exam-facts">
        <span><ListChecks size={19} /> 4지선다 {EXAM_COUNT}문항</span>
        <span><Clock3 size={19} /> 시간 종료 시 자동 제출</span>
      </div>
      {running ? <Link className="button primary full" to={'/exam/' + running.id}><Play size={17} /> 진행 중인 시험 열기</Link>
      : <form onSubmit={start}>
        <div className="field">
          <label htmlFor="minutes">제한 시간 (분)</label>
          <input id="minutes" type="number" min={1} inputMode="numeric" required value={minutes}
            onChange={(event) => setMinutes(event.target.value)} />
        </div>
        {error && <ErrorNotice message={error} />}
        <button className="button primary full" disabled={busy}>{busy ? '문제를 구성하는 중' : '모의고사 시작'} <ArrowRight size={17} /></button>
      </form>}
    </section>
    {recent.length > 0 && <section className="recent-exams">
      <div className="section-heading"><h2>최근 시험</h2></div>
      {recent.map((exam) => <Link className="topic-row" key={exam.id} to={'/exam/' + exam.id}>
        <ClipboardCheck size={18} /><strong>{new Date(exam.startedAt).toLocaleString('ko-KR')}</strong><ArrowRight size={17} />
      </Link>)}
    </section>}
  </div>
}
