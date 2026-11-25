import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, ArrowRight, BadgeCheck, Send, X } from 'lucide-react'
import type { MockExam, MockExamItem } from '../../../shared/exam'
import { Explanation } from '../../ui/QuestionContent'

const labels = ['①', '②', '③', '④']

export function ExamQuestionView({ exam, item, busy, expired, onMove, onAnswer, onSubmit }: {
  exam: MockExam; item: MockExamItem | undefined; busy: boolean; expired: boolean;
  onMove: (position: number) => void; onAnswer: (choice: number) => void; onSubmit: () => void
}) {
  const complete = exam.submittedAt !== null
  const answered = exam.responses.filter((choice) => choice !== null).length
  return <div className="mock-exam-layout">
    <section className="mock-exam-panel" aria-labelledby="mock-exam-question">
      {item ? <>
        <span className="mock-exam-count">{item.position}번</span>
        <h2 id="mock-exam-question">다음 중 {item.target === 'O' ? '옳은' : '옳지 않은'} 것은?</h2>
        <div className="mock-exam-options" role="group" aria-label="보기">
          {item.options.map(({ prompt }, index) => complete
            ? <div className="mock-exam-option" key={index} data-correct={item.review?.correctChoice === index}>
              <div><strong>{labels[index]}</strong><p>{prompt}</p></div>
              {item.review && <details><summary>교재 {item.review.options[index].no}번 · 출처 및 해설</summary>
                <p className="mock-exam-source">{item.review.options[index].source}</p>
                <Explanation question={item.review.options[index]} />
              </details>}
            </div>
            : <button type="button" className="mock-exam-option" key={index} aria-pressed={item.choice === index} disabled={busy || expired}
              onClick={() => onAnswer(index)}><strong>{labels[index]}</strong><span>{prompt}</span></button>)}
        </div>
        {complete && <p className="mock-exam-source">내 답 {item.choice === null ? '미응답' : labels[item.choice]} · 정답 {item.review ? labels[item.review.correctChoice] : '불러오는 중'}</p>}
        <footer className="mock-exam-move">
          <button type="button" className="ons-icon-button" aria-label="이전 문제" title="이전 문제" disabled={busy || item.position === 1} onClick={() => onMove(item.position - 1)}><ArrowLeft size={20} aria-hidden="true" /></button>
          <button type="button" className="ons-icon-button" aria-label="다음 문제" title="다음 문제" disabled={busy || item.position === exam.responses.length} onClick={() => onMove(item.position + 1)}><ArrowRight size={20} aria-hidden="true" /></button>
        </footer>
      </> : <h2 id="mock-exam-question">문항을 불러오는 중</h2>}
    </section>
    <aside className="mock-exam-panel" aria-label="답안표">
      <h2>{complete ? <><BadgeCheck size={21} aria-hidden="true" /> {exam.score}/{exam.responses.length} 정답</> : '답안표'}</h2>
      <p>응답 {answered} · 미응답 {exam.responses.length - answered}</p>
      <div className="mock-exam-sheet">
        {exam.responses.map((choice, index) => <button key={index} type="button" className="ons-icon-button" data-answered={choice !== null}
          aria-current={item?.position === index + 1 ? 'step' : undefined} aria-label={`${index + 1}번 ${choice === null ? '미응답' : '응답 완료'}`}
          disabled={busy} onClick={() => onMove(index + 1)}>{index + 1}</button>)}
      </div>
      {!complete && <Dialog.Root>
        <Dialog.Trigger asChild><button type="button" className="ons-button" disabled={busy}><Send size={18} aria-hidden="true" />시험 제출</button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="ons-stage-overlay" />
          <Dialog.Content className="ons-stage-dialog mock-exam-dialog">
            <Dialog.Close asChild><button type="button" className="ons-icon-button ons-stage-dialog-close" aria-label="제출 안내 닫기"><X size={20} aria-hidden="true" /></button></Dialog.Close>
            <Dialog.Title>시험을 제출할까요?</Dialog.Title>
            <Dialog.Description>응답 {answered}문항 · 미응답 {exam.responses.length - answered}문항</Dialog.Description>
            <Dialog.Close asChild><button type="button" className="ons-button" onClick={onSubmit}><Send size={18} aria-hidden="true" />제출하고 결과 보기</button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>}
    </aside>
  </div>
}
