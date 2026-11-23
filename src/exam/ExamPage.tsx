import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ArrowRight, Send } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { isExamOpen } from '../book/publicPreview'
import { LockedPreview } from '../app/LockedPreview'
import { db, type ExamSession } from '../storage/db'
import { changeExam, submitExam } from '../storage/exams'
import { ErrorNotice, Loading, Modal } from '../ui/Controls'
import { ExamClock } from './ExamClock'
import { ExamResults } from './ExamResults'
import { examPrompt, optionLabels } from './ExamReview'

function ExamRunner({ exam }: { exam: ExamSession }) {
  const [expired, setExpired] = useState(() => Date.now() >= exam.deadline)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const answered = exam.responses.filter((choice) => choice !== null).length
  const current = exam.questions[exam.position]

  useEffect(() => {
    if (!expired) return
    void submitExam(exam.id).catch(() => setError('시험 결과를 저장하지 못했습니다. 다시 제출해 주세요.'))
  }, [expired, exam.id])

  function move(position: number, choice?: number) {
    void changeExam(exam.id, position, choice).then(() => {
      if (choice === undefined) window.scrollTo(0, 0)
    }).catch(() => setError('답안을 저장하지 못했습니다. 다시 시도해 주세요.'))
  }

  function submit() {
    void submitExam(exam.id).catch(() => setError('시험 결과를 저장하지 못했습니다. 다시 제출해 주세요.'))
  }

  return <div className="exam-layout" data-quiet>
    <div className="exam-top">
      <Link className="back-link" to="/exam"><ArrowLeft size={17} /> 모의고사</Link>
      <ExamClock deadline={exam.deadline} onExpire={setExpired} />
    </div>
    <div className="exam-body">
      <article className="surface exam-question">
        <div className="question-label"><span className="tag">{exam.position + 1}번</span><span>{answered}/{exam.questions.length} 답안 선택</span></div>
        <h1>{examPrompt(current)}</h1>
        <div className="exam-options" role="group" aria-label="보기">
          {current.options.map((option, index) => <button className="exam-option" type="button" key={option.id}
            disabled={expired} aria-pressed={exam.responses[exam.position] === index}
            onClick={() => move(exam.position, index)}>
            <strong>{optionLabels[index]}</strong><span className="original">{option.prompt}</span>
          </button>)}
        </div>
        <div className="question-navigation">
          <button className="button secondary" disabled={expired || !exam.position} onClick={() => move(exam.position - 1)}><ArrowLeft size={16} /> 이전</button>
          <button className="button secondary" disabled={expired || exam.position === exam.questions.length - 1}
            onClick={() => move(exam.position + 1)}>다음 <ArrowRight size={16} /></button>
        </div>
      </article>
      <aside className="surface answer-sheet">
        <h2>답안표</h2>
        <div className="number-grid">
          {exam.questions.map((_, index) => <button key={index}
            className={exam.responses[index] === null ? '' : 'filled'} disabled={expired}
            aria-current={exam.position === index ? 'step' : undefined}
            aria-label={(index + 1) + '번 이동' + (exam.responses[index] === null ? ', 미응답' : ', 응답 완료')}
            onClick={() => move(index)}>{index + 1}</button>)}
        </div>
        <button className="button primary full" onClick={() => expired ? submit() : setConfirm(true)}><Send size={16} /> 제출하기</button>
      </aside>
    </div>
    {error && <ErrorNotice message={error} />}
    {confirm && !expired && <Modal title="시험을 제출할까요?" close={() => setConfirm(false)}>
      <p className="dialog-description">응답 {answered}문항 · 미응답 {exam.questions.length - answered}문항</p>
      <div className="button-row">
        <button className="button secondary" onClick={() => setConfirm(false)}>이어서 풀기</button>
        <button className="button primary" onClick={() => { setConfirm(false); submit() }}>시험 제출</button>
      </div>
    </Modal>}
  </div>
}

export default function ExamPage() {
  const { id } = useParams()
  const exam = useLiveQuery(() => id ? db.exams.get(id) : undefined, [id], null)
  if (exam === null) return <Loading />
  if (!exam) return <ErrorNotice message="모의고사 기록을 찾을 수 없습니다." />
  if (!isExamOpen(exam)) return <LockedPreview title="이 모의고사는 잠겨 있어요" />
  return exam.status === 'submitted' ? <ExamResults exam={exam} /> : <ExamRunner key={exam.id} exam={exam} />
}
