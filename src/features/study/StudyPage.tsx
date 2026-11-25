import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, CircleCheck, CircleX, ClipboardList, Play, RotateCcw, Shuffle } from 'lucide-react'
import type { Ox, Stage } from '../../book/types'
import { selectNumberRange, shuffle } from '../../study/selection'
import { Explanation } from '../../ui/QuestionContent'
import type { StudyProgress, StudyQuestion, StudyResult } from '../../../shared/study'
import { StudyRequestError, studyError, studyRequest } from './api'
import { LegacyImport } from './LegacyImport'
import './study.css'

interface Catalog {
  questions: { no: number; stage: Stage }[]
  access: { bookVerified: boolean }
}
interface Session { user: { id: string; name: string; email: string } }
interface Review { questions: Catalog['questions']; next: number | null }
interface Turn { question: StudyQuestion; eventId: string; choice?: Ox; result?: StudyResult }

export function StudyPage() {
  const [initial, setInitial] = useState<{ catalog: Catalog; session: Session } | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [progress, setProgress] = useState<StudyProgress | null>(null)
  const [stage, setStage] = useState<Stage>(1)
  const [mode, setMode] = useState<'order' | 'random'>('order')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [turn, setTurn] = useState<Turn | null>(null)
  const [sequence, setSequence] = useState<number[]>([])
  const [position, setPosition] = useState(0)
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const questionHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    void Promise.all([
      studyRequest<Catalog>('/study/catalog', options), studyRequest<Session>('/session', options),
      studyRequest<{ progress: StudyProgress }>('/study/progress', options),
    ]).then(([catalog, session, data]) => {
      setInitial({ catalog, session })
      setProgress(data.progress)
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      if (failure instanceof StudyRequestError && failure.status === 401) setSignedOut(true)
      else setError(studyError(failure))
    })
    return () => controller.abort()
  }, [])

  const displayedNo = turn?.question.no
  useEffect(() => { if (displayedNo) questionHeading.current?.focus() }, [displayedNo])

  async function run(work: () => Promise<void>) {
    setError('')
    setBusy(true)
    try { await work() } catch (failure) {
      if (failure instanceof StudyRequestError && [401, 403, 404].includes(failure.status)) setTurn(null)
      setError(studyError(failure))
    } finally { setBusy(false) }
  }

  async function open(numbers: number[], index = 0) {
    await run(async () => {
      setTurn(null)
      const { question } = await studyRequest<{ question: StudyQuestion }>('/study/questions/' + numbers[index])
      setSequence(numbers)
      setPosition(index)
      setTurn({ question, eventId: crypto.randomUUID() })
    })
  }

  async function refreshProgress() {
    try {
      const { progress: updated } = await studyRequest<{ progress: StudyProgress }>('/study/progress')
      setProgress(updated)
    } catch { /* The next progress read can retry the aggregate independently of a saved answer. */ }
  }

  async function answer(choice: Ox) {
    if (!turn || busy) return
    const { eventId, question } = turn
    setTurn({ ...turn, choice })
    await run(async () => {
      const { result } = await studyRequest<{ result: StudyResult }>('/study/answers', {
        body: { eventId, no: question.no, revision: question.revision, choice },
      })
      setTurn({ ...turn, choice, result })
      await refreshProgress()
    })
  }

  if (!initial) return <main className="ons-landing">
    <h1>OX 학습</h1>
    {signedOut ? <><p>로그인하면 1단계 문제를 풀고 진도를 저장할 수 있어요.</p><a href="/account" className="ons-button">로그인 및 회원가입<ArrowRight size={18} aria-hidden="true" /></a></>
      : error ? <><p role="alert">{error}</p><a href="/study" className="ons-button">다시 불러오기</a></>
        : <p role="status">학습 화면을 불러오고 있습니다.</p>}
  </main>

  const { catalog, session } = initial
  const numbers = catalog.questions.filter((item) => item.stage === stage).map(({ no }) => no)
  const allowed = new Set(catalog.questions.map(({ no }) => no))
  const defaultFirst = numbers[0]
  const defaultLast = numbers.at(-1)

  function submitRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const range = selectNumberRange(numbers, Number(first || defaultFirst), Number(last || defaultLast))
      void open(mode === 'random' ? shuffle(range) : range)
    } catch { setError('현재 단계에 포함된 시작 번호와 끝 번호를 입력해 주세요.') }
  }

  return <main className="study-page">
    <header className="study-heading">
      <span className="study-icon"><BookOpen aria-hidden="true" /></span>
      <div><h1>OX 학습</h1><p>{catalog.access.bookVerified ? '교재 인증 회원 · 1~3단계' : '무료 회원 · 1단계'}</p></div>
    </header>
    <div className="study-grid">
      <section className="study-card" aria-labelledby="study-range">
        <h2 id="study-range">문제 고르기</h2>
        <form onSubmit={submitRange}>
          <fieldset disabled={busy}><legend>교재 단계</legend><div className="study-options">
            {([1, 2, 3] as const).map((level) => <label key={level}>
              <input type="radio" name="stage" checked={stage === level} disabled={level > 1 && !catalog.access.bookVerified}
                onChange={() => { setStage(level); setFirst(''); setLast('') }} /> {level}단계
            </label>)}
          </div></fieldset>
          <fieldset disabled={busy || !numbers.length}><legend>출제 순서</legend><div className="study-options">
            <label><input type="radio" name="mode" checked={mode === 'order'} onChange={() => setMode('order')} /><ClipboardList size={16} aria-hidden="true" /> 번호순</label>
            <label><input type="radio" name="mode" checked={mode === 'random'} onChange={() => setMode('random')} /><Shuffle size={16} aria-hidden="true" /> 랜덤</label>
          </div></fieldset>
          {defaultFirst && <>
            <div className="study-fields">
              <label>시작 번호<input type="number" inputMode="numeric" min={defaultFirst} max={defaultLast} placeholder={String(defaultFirst)} value={first} onChange={(event) => setFirst(event.currentTarget.value)} disabled={busy} /></label>
              <label>끝 번호<input type="number" inputMode="numeric" min={defaultFirst} max={defaultLast} placeholder={String(defaultLast)} value={last} onChange={(event) => setLast(event.currentTarget.value)} disabled={busy} /></label>
            </div>
            <div className="study-options study-quick" role="group" aria-label="시작 번호부터 빠른 범위 지정">
              {[1, 10, 20, 30, 50].map((size) => <button type="button" className="study-secondary" key={size} disabled={busy} onClick={() => {
                const begin = Number(first || defaultFirst)
                const available = numbers.filter((no) => no >= begin)
                if (available.length) setLast(String(available[Math.min(size, available.length) - 1]))
              }}>{size}문제</button>)}
            </div>
          </>}
          {numbers.length ? <button className="ons-button" disabled={busy}><Play size={17} aria-hidden="true" />문제 열기</button>
            : <p>이 단계의 학습 자료를 준비 중입니다.</p>}
        </form>
      </section>
      <section className="study-card" aria-labelledby="study-progress">
        <h2 id="study-progress">내 학습 기록</h2>
        <p>{progress?.attempted ?? 0}문제 풀이 · 기존 기록 {progress?.imported ?? 0}개</p>
        <div className="study-history">
          {progress?.lastNo && <button type="button" className="study-secondary" disabled={busy} onClick={() => void open([progress.lastNo!])}>
            <RotateCcw size={16} aria-hidden="true" /> {progress.lastNo}번 다시 열기</button>}
          <button type="button" className="study-secondary" disabled={busy} onClick={() => void run(async () => {
            setReview(await studyRequest<Review>('/study/review'))
          })}><ClipboardList size={16} aria-hidden="true" /> 오답노트 열기</button>
        </div>
        {review && (review.questions.length ? <>
          <ul className="study-review" aria-label="복습할 문제">{review.questions.map(({ no, stage: level }) =>
            <li key={no}><button type="button" className="study-secondary" disabled={busy} onClick={() => void open([no])}>{level}단계 · {no}번</button></li>)}</ul>
          {review.next && <button type="button" className="study-secondary" disabled={busy} onClick={() => void run(async () => {
            setReview(await studyRequest<Review>('/study/review?before=' + review.next))
          })}>오답 더 보기</button>}
        </> : <p role="status">복습할 오답이 없습니다.</p>)}
      </section>
    </div>
    {error && <p className="study-error" role="alert">{error}</p>}
    {turn && <article className="study-card study-question" aria-labelledby="study-question-heading">
      <p className="study-meta">{turn.question.stage}단계 · {position + 1}/{sequence.length}</p>
      <h2 id="study-question-heading" tabIndex={-1} ref={questionHeading}>교재 {turn.question.no}번</h2>
      <p className="study-prompt">{turn.question.prompt}</p>
      {turn.question.source && <p className="study-source">{turn.question.source}</p>}
      {!turn.result ? <div className="study-answers">
        {(['O', 'X'] as const).map((choice) => <button key={choice} type="button" className="study-secondary"
          disabled={busy || Boolean(turn.choice && turn.choice !== choice)} onClick={() => void answer(choice)}>
          {choice === 'O' ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}{turn.choice === choice && !busy ? `${choice} 다시 제출` : choice}
        </button>)}
      </div> : <>
        <p className="study-result" role="status">{turn.result.correct ? '정답입니다.' : '틀렸습니다.'} 내 답 {turn.choice} · 정답 {turn.result.answer}</p>
        <details open><summary>해설</summary><Explanation question={turn.result} /></details>
        {position + 1 < sequence.length ? <button type="button" className="ons-button" disabled={busy} onClick={() => void open(sequence, position + 1)}>다음 문제<ArrowRight size={18} aria-hidden="true" /></button>
          : <p>선택한 범위의 마지막 문제입니다.</p>}
      </>}
    </article>}
    <LegacyImport account={session.user} allowed={allowed} onImported={() => void refreshProgress()} />
  </main>
}
