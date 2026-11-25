import { ArrowRight, LockKeyhole, Play, Timer } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { MockExam, MockExamItem } from '../../../shared/exam'
import { DEFAULT_MINUTES } from '../../exam/generate'
import { StudyRequestError, studyError, studyRequest } from '../study/api'
import { ExamQuestionView } from './ExamQuestionView'
import './exam.css'

export function ExamPage() {
  const [exam, setExam] = useState<MockExam | null>()
  const [item, setItem] = useState<MockExamItem>()
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES))
  const [error, setError] = useState('')
  const [gate, setGate] = useState<'login' | 'book' | null>(null)
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const serverOffset = useRef(0)
  const automatic = useRef<string | null>(null)

  function update(next: MockExam | null) {
    if (next) serverOffset.current = next.serverTime - Date.now()
    setExam(next)
  }

  function unavailable(failure: unknown) {
    if (failure instanceof StudyRequestError && (failure.status === 401 || failure.code === 'book_required')) {
      setGate(failure.status === 401 ? 'login' : 'book')
      setExam(null)
      setItem(undefined)
    } else setError(failure instanceof StudyRequestError && failure.code === 'insufficient_exam_pool'
      ? '20문항을 구성할 수 있는 교재 자료를 준비하고 있습니다.' : studyError(failure))
  }

  useEffect(() => {
    const controller = new AbortController()
    void studyRequest<{ exam: MockExam | null }>('/exam/current', { signal: controller.signal }).then(async ({ exam: next }) => {
      update(next)
      if (next) {
        const { item: first } = await studyRequest<{ item: MockExamItem }>(`/exam/${next.id}/item/1`, { signal: controller.signal })
        setItem(first)
      }
    }).catch((failure: unknown) => { if (!controller.signal.aborted) unavailable(failure) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!exam || exam.submittedAt !== null) { setRemaining(null); return }
    const tick = () => setRemaining(Math.max(0, Math.ceil((exam.deadline - (Date.now() + serverOffset.current)) / 1000)))
    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [exam?.id, exam?.deadline, exam?.submittedAt])

  async function run(work: () => Promise<void>) {
    if (busy) return
    setError('')
    setBusy(true)
    try { await work() } catch (failure) { unavailable(failure) } finally { setBusy(false) }
  }

  async function move(id: string, position: number) {
    const { item: next } = await studyRequest<{ item: MockExamItem }>(`/exam/${id}/item/${position}`)
    setItem(next)
    if (next.review && exam?.submittedAt === null) {
      const { exam: completed } = await studyRequest<{ exam: MockExam }>(`/exam/${id}`)
      update(completed)
    }
  }

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(async () => {
      const { exam: next } = await studyRequest<{ exam: MockExam }>('/exam/start', { body: { minutes: Number(minutes) } })
      setRemaining(null)
      setItem(undefined)
      update(next)
      await move(next.id, 1)
    })
  }

  function submit() {
    if (!exam) return
    void run(async () => {
      const { exam: completed } = await studyRequest<{ exam: MockExam }>(`/exam/${exam.id}/submit`, { body: {} })
      update(completed)
      await move(completed.id, item?.position ?? 1)
    })
  }

  useEffect(() => {
    if (remaining !== 0 || !exam || exam.submittedAt !== null || busy || automatic.current === exam.id) return
    automatic.current = exam.id
    submit()
  }, [remaining, exam, busy])

  function save(choice: number) {
    if (!exam || !item || exam.submittedAt !== null || remaining === 0) return
    void run(async () => {
      try {
        const saved = await studyRequest<{ choice: number; version: number }>(`/exam/${exam.id}/item/${item.position}`, { body: { choice, version: item.version } })
        setItem({ ...item, ...saved })
        setExam({ ...exam, responses: exam.responses.map((response, index) => index === item.position - 1 ? saved.choice : response) })
      } catch (failure) {
        if (!(failure instanceof StudyRequestError) || failure.code !== 'exam_answer_conflict') throw failure
        const { exam: latest } = await studyRequest<{ exam: MockExam }>(`/exam/${exam.id}`)
        update(latest)
        await move(exam.id, item.position)
        if (latest.submittedAt === null && latest.responses[item.position - 1] !== choice) setError('답안이 갱신되었습니다. 선택한 답안을 다시 확인해 주세요.')
      }
    })
  }

  return <main className="mock-exam ons-container">
    <header className="mock-exam-heading"><div><Timer size={21} aria-hidden="true" /><h1>실전 모의고사</h1></div>
      {remaining !== null && <div className="mock-exam-time" role="timer" aria-label="남은 시간">
        {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}
      </div>}
    </header>
    {error && <p className="mock-exam-error" role="alert">{error}</p>}
    {gate ? <section className="mock-exam-panel">
      <h2><LockKeyhole size={21} aria-hidden="true" />교재 인증 회원 전용</h2>
      <p>교재의 세 단계에서 뽑은 지문으로 4지선다 20문제를 풉니다.</p>
      <a className="ons-button" href="/account?study=exam">{gate === 'login' ? '로그인 및 회원가입' : '교재 인증'}<ArrowRight size={18} aria-hidden="true" /></a>
    </section> : <>
      {exam === undefined && !error && <p role="status">모의고사 기록을 불러오는 중입니다.</p>}
      {(exam === null || exam?.submittedAt != null) && <form className="mock-exam-panel mock-exam-start" onSubmit={start}>
        <div><h2>{exam ? '새 모의고사' : '4지선다 20문항'}</h2><p>제한 시간이 지나면 저장된 답안을 제출합니다.</p></div>
        <label>제한 시간 (분)<input type="number" inputMode="numeric" value={minutes} min={1} max={180} required disabled={busy}
          onChange={(event) => setMinutes(event.currentTarget.value)} /></label>
        <button className="ons-button" disabled={busy}><Play size={18} aria-hidden="true" />시험 시작</button>
      </form>}
      {exam && <ExamQuestionView exam={exam} item={item} busy={busy} expired={remaining === 0}
        onMove={(position) => void run(() => move(exam.id, position))} onAnswer={save} onSubmit={submit} />}
    </>}
  </main>
}
