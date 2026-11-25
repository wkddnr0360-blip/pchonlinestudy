import { ArrowLeft, ArrowRight, Circle, CircleCheck, CircleX, Flag, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Ox } from '../../book/types'
import { stagePresentation } from '../../app/stages'
import { Explanation } from '../../ui/QuestionContent'
import type { StudyQuestion, StudyResult } from '../../../shared/study'
import { StageArtwork } from './StageArtwork'
import { StudyResultStatistics } from './StudyResultStatistics'

export interface StudyTurn { question: StudyQuestion; eventId: string; practice?: boolean; choice?: Ox; result?: StudyResult }

export function StudyReader({ turn, position, total, busy, error, onAnswer, onBack, onNext }: {
  turn: StudyTurn; position: number; total: number; busy: boolean; error: string;
  onAnswer: (choice: Ox) => void; onBack: () => void; onNext: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [turn.eventId])
  const { question, result } = turn
  const hasNext = position + 1 < total
  return <main className="study-reader ons-container" data-stage={question.stage}>
    <nav className="study-reader-bar" aria-label="학습 탐색">
      <button className="ons-icon-button" type="button" onClick={onBack} disabled={busy} aria-label="학습 설정으로 돌아가기" title="학습 설정으로 돌아가기"><ArrowLeft size={21} aria-hidden="true" /></button>
      <span className="ons-stage-no">{question.stage}단계 · {stagePresentation(question.stage).name}</span>
      <span className="study-position" aria-label={`${total}문제 중 ${position + 1}번`}>{position + 1}<span> / {total}</span></span>
    </nav>
    <progress className="study-progress-bar" aria-label="학습 진행률" max={total} value={position + (result ? 1 : 0)} />
    <div className="study-reader-layout" data-graded={Boolean(result)}>
      <article className="study-panel study-paper" aria-labelledby="study-question-heading">
        <div className="study-paper-title">
          <h1 id="study-question-heading" ref={heading} tabIndex={-1}>교재 {question.no}번</h1>
          <StageArtwork stage={question.stage} reaction={Boolean(result)} className="study-reader-art" />
        </div>
        <p className="study-prompt">{question.prompt}</p>
        {question.source && <p className="study-source"><span>기출 출처</span>{question.source}</p>}
        {!result && <div className="study-answers">
          {([{ choice: 'O', label: '맞다', icon: Circle }, { choice: 'X', label: '틀리다', icon: X }] as const).map(({ choice, label, icon: Icon }) =>
            <button key={choice} type="button" className={`study-choice study-choice-${choice.toLowerCase()}`}
              aria-label={`${choice} ${label}`} disabled={busy || Boolean(turn.choice && turn.choice !== choice)} onClick={() => onAnswer(choice)}>
              <Icon size={32} strokeWidth={2.3} aria-hidden="true" /><span>{turn.choice === choice && !busy ? '다시 제출' : label}</span>
            </button>)}
        </div>}
        {error && <p className="study-error" role="alert">{error}</p>}
      </article>
      {result && <section className="study-panel study-feedback" aria-label="채점 결과">
        <p className="study-result" data-correct={result.correct} role="status">
          {result.correct ? <CircleCheck size={22} aria-hidden="true" /> : <CircleX size={22} aria-hidden="true" />}
          <span><strong>{result.correct ? '정답입니다.' : '틀렸습니다.'}</strong><small>내 답 {turn.choice} · 정답 {result.answer}</small></span>
        </p>
        <details open><summary>해설</summary><Explanation question={result} /></details>
        {result.statistics && <StudyResultStatistics statistics={result.statistics} />}
        <div className="study-next">
          <button type="button" className="ons-button study-next-button" disabled={busy} onClick={hasNext ? onNext : onBack}
            aria-label={hasNext ? '다음 문제' : '학습 마치기'} title={hasNext ? '다음 문제' : '학습 마치기'}>
            {hasNext ? <ArrowRight size={22} aria-hidden="true" /> : <><Flag size={19} aria-hidden="true" /> 학습 마치기</>}
          </button>
        </div>
      </section>}
    </div>
  </main>
}
