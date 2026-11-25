import { ArrowLeft, ArrowRight, BookOpen, Check, Circle, Flag, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Ox } from '../../book/types'
import { Explanation } from '../../ui/QuestionContent'
import type { StudyQuestion, StudyResult } from '../../../shared/study'
import { StageArtwork } from './StageArtwork'
import { StudyResultStatistics } from './StudyResultStatistics'
import './study-reader.css'

export interface StudyTurn { question: StudyQuestion; eventId: string; practice?: boolean; choice?: Ox; result?: StudyResult }

const choices = [{ choice: 'O', label: '맞다', icon: Circle }, { choice: 'X', label: '틀리다', icon: X }] as const

export function StudyReader({ turn, position, total, busy, error, backLabel, onAnswer, onBack, onPrevious, onNext }: {
  turn: StudyTurn; position: number; total: number; busy: boolean; error: string; backLabel: string;
  onAnswer: (choice: Ox) => void; onBack: () => void; onPrevious: () => void; onNext: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [turn.eventId])
  const { question, result } = turn
  const hasNext = position + 1 < total
  return <main className="study-reader ons-container" data-stage={question.stage}>
    <button className="study-reader-back" type="button" onClick={onBack} disabled={busy}>
      <ArrowLeft size={21} aria-hidden="true" />{backLabel}
    </button>
    <div className="study-reader-layout">
      <article className="study-panel study-paper" aria-labelledby="study-question-heading">
        <header className="study-paper-title">
          <span className="ons-stage-no">{question.stage}단계</span>
          <h1 id="study-question-heading" ref={heading} tabIndex={-1}>교재 {question.no}번</h1>
          <span className="study-position"><span className="ons-visually-hidden">문항 위치 </span>{position + 1} / {total}</span>
        </header>
        <p className="study-prompt">{question.prompt}</p>
        {question.source && <p className="study-source"><span>기출 출처</span>{question.source}</p>}
        <div className="study-answers" role="group" aria-label="답안 선택">
          {choices.map(({ choice, label, icon: Icon }) =>
            <button key={choice} type="button" className={`study-choice study-choice-${choice.toLowerCase()}`}
              aria-label={`${choice} ${label}`} aria-pressed={turn.choice === choice}
              disabled={Boolean(result) || busy || Boolean(turn.choice && turn.choice !== choice)} onClick={() => onAnswer(choice)}>
              <Icon size={30} strokeWidth={2.1} aria-hidden="true" />
              <span>{!result && turn.choice === choice && !busy ? '다시 제출' : choice}</span>
            </button>)}
        </div>
        {error && <p className="study-error" role="alert">{error}</p>}
      </article>
      <section className="study-panel study-feedback" aria-label="해설과 채점 결과">
        {result ? <>
          <div className="study-result" data-correct={result.correct} role="status">
            <StageArtwork stage={question.stage} reaction={result.correct} className="study-result-art" />
            {result.correct ? <Check size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
            <div><strong>{result.correct ? '정답이에요!' : '틀렸어요.'}</strong><small>내 답 {turn.choice} · 정답 {result.answer}</small></div>
          </div>
          <Explanation question={result} />
          {result.statistics && <StudyResultStatistics statistics={result.statistics} />}
        </> : <div className="study-feedback-empty">
          <BookOpen size={29} aria-hidden="true" />
          <p>{busy && turn.choice ? '답을 확인하고 있어요.' : '답을 고르면 해설이 열려요.'}</p>
        </div>}
      </section>
    </div>
    <nav className="study-reader-controls" aria-label="문항 이동">
      <button type="button" className="study-secondary" disabled={busy || position === 0} onClick={onPrevious} aria-label="이전 문제">
        <ArrowLeft size={19} aria-hidden="true" /> 이전
      </button>
      <button type="button" className="ons-button" disabled={busy} onClick={hasNext ? onNext : onBack}
        aria-label={hasNext ? '다음 문제' : '학습 마치기'}>
        {hasNext ? <>다음 <ArrowRight size={19} aria-hidden="true" /></> : <>학습 마치기 <Flag size={18} aria-hidden="true" /></>}
      </button>
    </nav>
  </main>
}
