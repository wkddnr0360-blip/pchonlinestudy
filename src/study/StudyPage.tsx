import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ArrowRight, BookOpen, Check, ListChecks } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getQuestions } from '../book/catalog'
import type { BookIndex, Ox, Question } from '../book/types'
import { playReward } from '../feedback/audio'
import { useFeedbackPreferences } from '../feedback/preferences'
import { db, type StudySession } from '../storage/db'
import { answerStudy, moveStudy } from '../storage/studies'
import { ErrorNotice, Loading } from '../ui/Controls'
import { OxButtons } from '../ui/OxButtons'
import { Explanation, QuestionSource } from '../ui/QuestionContent'
import { Teacher } from '../ui/Teacher'

function QuestionView({ session, question, count }: { session: StudySession; question: Question; count: number }) {
  const attempt = useLiveQuery(() => db.attempts.get(session.id + ':' + question.no), [session.id, question.no])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { fun, reward } = useFeedbackPreferences()

  async function pick(answer: Ox) {
    setBusy(true)
    try {
      const correct = await answerStudy(session, question, answer)
      if (correct && fun) playReward(reward)
    }
    catch { setError('답안을 저장하지 못했습니다. 다시 선택해 주세요.') }
    finally { setBusy(false) }
  }

  return <div className="study-columns">
    <article className="question-panel">
      <div className="question-label"><span className="tag">{question.stage}단계</span><strong>교재 {question.no.toLocaleString('ko-KR')}번</strong><span>{session.position + 1} / {count}</span></div>
      <h1 className="original question-prompt">{question.prompt}</h1>
      <QuestionSource question={question} />
      <OxButtons selected={attempt?.answer} onAnswer={(answer) => void pick(answer)} disabled={busy} />
      {error && <ErrorNotice message={error} />}
    </article>
    <aside className="study-answer">
      {attempt ? <>
        <div className={'answer-feedback ' + (attempt.correct ? 'feedback-correct' : 'feedback-missed')} role="status">
          <Teacher stage={question.stage} className={attempt.correct ? 'win-motion' : 'encourage-motion'} />
          {attempt.correct ? <Check size={19} /> : <BookOpen size={19} />}
          <strong>{attempt.correct ? '정답이에요!' : '오답노트에 담았어요.'}</strong>
          {attempt.correct && <span className="pixel-sparks" aria-hidden="true" />}
        </div>
        <Explanation question={question} />
      </> : <div className="answer-placeholder"><BookOpen size={24} /><span>답을 고르면 해설이 열려요.</span></div>}
    </aside>
  </div>
}

function StudySessionView({ book, session }: { book: BookIndex; session: StudySession }) {
  const [questions, setQuestions] = useState<Question[]>()
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)
  const [retry, setRetry] = useState(0)
  const attempts = useLiveQuery(() => db.attempts.where('sessionId').equals(session.id).count(), [session.id], 0)
  useEffect(() => {
    let live = true
    getQuestions(book, session.scope).then((list) => { if (live) setQuestions(list) })
      .catch(() => { if (live) setError('문제를 불러오지 못했습니다.') })
    return () => { live = false }
  }, [book, session.scope.stage, session.scope.part, session.scope.chapterKey, session.scope.section, retry])

  const byNumber = useMemo(() => new Map(questions?.map((question) => [question.no, question])), [questions])
  const count = session.numbers.length
  const stageLink = '/stage/' + session.scope.stage
  const current = byNumber.get(session.numbers[session.position])
  if (session.version !== book.version) return <ErrorNotice message="교재가 업데이트되었습니다. 목차에서 새 학습을 시작해 주세요." />
  if (error) return <ErrorNotice message={error} retry={() => { setError(''); setRetry((value) => value + 1) }} />
  if (!questions) return <Loading>학습 문제를 불러오는 중이에요.</Loading>
  if (!current) return <ErrorNotice message="학습 문제를 찾을 수 없습니다." />
  if (completed) return <section className="center-card completion">
    <span className="small-icon primary-icon"><ListChecks size={28} /></span><h1>학습 결과</h1>
    <p>{count.toLocaleString('ko-KR')}문항 중 {attempts.toLocaleString('ko-KR')}문항에 답했어요.</p>
    <div className="button-row"><Link className="button secondary" to={stageLink}>교재 목차</Link><Link className="button primary" to="/review">오답노트</Link></div>
  </section>

  function move(position: number) {
    void moveStudy(session, position).then(() => window.scrollTo(0, 0)).catch(() => setError('진도를 저장하지 못했습니다.'))
  }

  return <>
    <Link className="back-link" to={stageLink}><ArrowLeft size={17} /> 교재 목차</Link>
    <QuestionView key={current.id} session={session} question={current} count={count} />
    <div className="question-navigation">
      <button className="button secondary" disabled={session.position === 0} onClick={() => move(session.position - 1)}><ArrowLeft size={17} /> 이전</button>
      {session.position + 1 < count
        ? <button className="button primary" onClick={() => move(session.position + 1)}>다음 <ArrowRight size={17} /></button>
        : <button className="button primary" onClick={() => setCompleted(true)}>학습 결과 <ArrowRight size={17} /></button>}
    </div>
  </>
}

export default function StudyPage({ book }: { book: BookIndex }) {
  const key = useParams()['*'] ?? ''
  const session = useLiveQuery(() => db.studies.get(key), [key], null)
  if (session === null) return <Loading />
  if (!session) return <ErrorNotice message="목차에서 새로운 학습을 시작해 주세요." />
  return <StudySessionView key={session.id} book={book} session={session} />
}
