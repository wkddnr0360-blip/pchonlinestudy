import { ArrowRight, LockKeyhole, NotebookPen, TicketCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Stage, Ox } from '../../book/types'
import { stagePresentation } from '../../app/stages'
import type { StudyCatalog, StudyProgress, StudyQuestion, StudyResult } from '../../../shared/study'
import { StudyRequestError, studyError, studyRequest } from './api'
import { stageFromQuery } from './navigation'
import { StageArtwork } from './StageArtwork'
import { StudyReader, type StudyTurn } from './StudyReader'
import { StudySetup } from './StudySetup'
import './study.css'

interface Review { questions: { no: number; stage: Stage }[]; next: number | null }

export function StudyPage() {
  const [route] = useState(() => {
    const params = new URLSearchParams(location.search)
    return { stage: stageFromQuery(params), review: params.get('view') === 'review' }
  })
  const [catalog, setCatalog] = useState<StudyCatalog>()
  const [progress, setProgress] = useState<StudyProgress>()
  const [signedOut, setSignedOut] = useState(false)
  const [turn, setTurn] = useState<StudyTurn | null>(null)
  const [reading, setReading] = useState(false)
  const [sequence, setSequence] = useState<number[]>([])
  const [position, setPosition] = useState(0)
  const [review, setReview] = useState<Review>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    void Promise.all([
      studyRequest<StudyCatalog>('/study/catalog', options),
      studyRequest<{ progress: StudyProgress }>('/study/progress', options),
      route.review ? studyRequest<Review>('/study/review', options) : undefined,
    ]).then(([nextCatalog, data, nextReview]) => {
      setCatalog(nextCatalog)
      setProgress(data.progress)
      setReview(nextReview)
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      if (failure instanceof StudyRequestError && failure.status === 401) setSignedOut(true)
      else setError(studyError(failure))
    })
    return () => controller.abort()
  }, [route.review])

  async function run(work: () => Promise<void>) {
    if (busy) return
    setError('')
    setBusy(true)
    try { await work() } catch (failure) {
      if (failure instanceof StudyRequestError && [401, 403, 404].includes(failure.status)) {
        setTurn(null)
        setReading(false)
        if (failure.status === 401) { setCatalog(undefined); setSignedOut(true) }
      }
      setError(studyError(failure))
    } finally { setBusy(false) }
  }

  function open(numbers: number[], index = 0) {
    if (!numbers.length) return
    void run(async () => {
      const { question } = await studyRequest<{ question: StudyQuestion }>('/study/questions/' + numbers[index])
      setSequence(numbers)
      setPosition(index)
      setTurn({ question, eventId: crypto.randomUUID() })
      setReading(true)
    })
  }

  function answer(choice: Ox) {
    if (!turn || busy) return
    const { eventId, question } = turn
    setTurn({ ...turn, choice })
    void run(async () => {
      const { result } = await studyRequest<{ result: StudyResult }>('/study/answers', {
        body: { eventId, no: question.no, revision: question.revision, choice },
      })
      setTurn({ ...turn, choice, result })
      setProgress((old) => old && { ...old, lastNo: question.no })
    })
  }

  function closeReader() {
    setReading(false)
    setError('')
    if (route.review && turn?.result) void run(async () => { setReview(await studyRequest<Review>('/study/review')) })
  }

  const { stage } = route
  const locked = !route.review && stage > 1 && catalog && !catalog.access.bookVerified
  if (signedOut || locked) return <main className="study-page study-gate ons-container" data-stage={stage}>
    <StageArtwork stage={stage} />
    <div><span className="ons-stage-no">{route.review ? '복습' : `${stage}단계`}</span>
      <h1>{route.review ? '오답노트' : stagePresentation(stage).name}</h1>
      <p>{locked ? '교재 구매 인증을 마치면 이 단계가 열립니다.' : '로그인하고 문제를 풀고 진도를 기록하세요.'}</p>
      <a href={`/account?study=${route.review ? 'review' : stage}`} className="ons-button">
        {locked ? <TicketCheck size={19} aria-hidden="true" /> : <LockKeyhole size={18} aria-hidden="true" />}
        {locked ? '교재 인증' : '로그인 및 회원가입'}<ArrowRight size={17} aria-hidden="true" />
      </a>
    </div>
  </main>

  if (!catalog) return <main className="ons-landing">
    <h1>{route.review ? '오답노트' : stagePresentation(stage).name}</h1>
    {error ? <><p role="alert">{error}</p><a href={location.pathname + location.search} className="ons-button">다시 불러오기</a></>
      : <p role="status">학습 화면을 불러오고 있습니다.</p>}
  </main>

  if (turn && reading) return <StudyReader turn={turn} position={position} total={sequence.length} busy={busy} error={error}
    onAnswer={answer} onBack={closeReader} onNext={() => open(sequence, position + 1)} />

  if (route.review) return <main className="study-page study-review-page ons-container">
    <header><NotebookPen size={27} aria-hidden="true" /><h1>오답노트</h1></header>
    {error && <p className="study-error" role="alert">{error}</p>}
    <section className="study-panel study-review-list" aria-label="복습할 문제">
      {review?.questions.length ? <ul>{review.questions.map(({ no, stage: level }) =>
        <li key={no}><button type="button" data-stage={level} disabled={busy} onClick={() => open([no])}>
          <span className="ons-stage-no">{level}단계</span><strong>교재 {no}번</strong><ArrowRight size={20} aria-hidden="true" />
        </button></li>)}</ul> : <p role="status">복습할 오답이 없습니다.</p>}
      {review?.next && <button type="button" className="study-secondary" disabled={busy} onClick={() => void run(async () => {
        const next = await studyRequest<Review>('/study/review?before=' + review.next)
        setReview({ questions: [...review.questions, ...next.questions], next: next.next })
      })}>오답 더 보기</button>}
    </section>
  </main>

  const recentNo = progress?.lastNo
  const relevantRecent = catalog.questions.some((item) => item.stage === stage && item.no === recentNo) ? recentNo ?? undefined : undefined
  const unfinished = turn && !turn.result
  return <StudySetup stage={stage} catalog={catalog} busy={busy} error={error} resumeNo={unfinished ? turn.question.no : relevantRecent}
    onOpen={open} onResume={() => {
      if (unfinished) setReading(true)
      else if (relevantRecent !== undefined) {
        const remaining = catalog.questions.filter((item) => item.stage === stage && item.no > relevantRecent).slice(0, 10)
        open(remaining.length ? remaining.map(({ no }) => no) : [relevantRecent])
      }
    }} />
}
