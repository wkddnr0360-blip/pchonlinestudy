import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Flag, Volume2, VolumeX } from 'lucide-react'
import type { Ox, Question } from '../book/types'
import { recordChallengeAnswer } from '../storage/challenge'
import { ErrorNotice, Modal } from '../ui/Controls'
import { OxButtons } from '../ui/OxButtons'
import { QuestionSource } from '../ui/QuestionContent'
import { ChallengeScene } from './ChallengeScene'
import { ChallengeTimer } from './ChallengeTimer'
import { playGameCue, type createGameMusic } from './gameAudio'
import { grade, initialProgress, questionTime, stageGoal, type Progress } from './rules'

export interface Session {
  id: string
  scope: string
  label: string
  first: Question
  draw: (stage: number) => Question | undefined
}

function makeTurn(question: Question, stage: number, position: number, bonus = 0) {
  const duration = questionTime(question, stage, bonus)
  return { question, stage, position, duration, until: Date.now() + duration }
}

export function ChallengeRun({ session, music, sound, toggleSound, finish }: {
  session: Session; music: ReturnType<typeof createGameMusic>; sound: boolean
  toggleSound: (stage: number) => void; finish: (progress: Progress) => void
}) {
  const [progress, setProgress] = useState(initialProgress)
  const [turn, setTurn] = useState(() => makeTurn(session.first, 1, 1))
  const [outcome, setOutcome] = useState<{ answer: Ox | null; correct: boolean; cleared: boolean; bonus: number }>()
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState(false)
  const answered = useRef(false)
  const timer = useRef<number>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const advance = useCallback((next: Progress, bonus: number) => {
    const question = session.draw(next.stage)
    if (!question) {
      finish(next)
      return
    }
    if (next.stage !== turn.stage) music.play(next.stage)
    setTurn(makeTurn(question, next.stage, turn.position + 1, bonus))
    setOutcome(undefined)
    answered.current = false
    window.scrollTo(0, 0)
  }, [finish, music, session, turn.position, turn.stage])

  const answer = useCallback((selection: Ox | null) => {
    if (answered.current) return
    answered.current = true
    const chosen = Date.now() < turn.until ? selection : null
    const correct = turn.question.answer === chosen
    const { next, cleared, bonus } = grade(progress, correct)
    setProgress(next)
    setOutcome({ answer: chosen, correct, cleared, bonus })
    if (sound) playGameCue(turn.stage, !next.lives ? 'finished' : cleared ? 'clear' : correct ? 'correct' : 'missed')
    void recordChallengeAnswer(session.id, turn.position, turn.question, chosen).catch(() => setError(true))
    if (!next.lives) timer.current = window.setTimeout(() => finish(next), 750)
    else if (!cleared) timer.current = window.setTimeout(() => advance(next, bonus), correct ? 550 : 850)
  }, [advance, finish, progress, session.id, sound, turn])

  const expire = useCallback(() => answer(null), [answer])

  function stop() {
    window.clearTimeout(timer.current)
    answered.current = true
    finish(progress)
  }

  return <div className="challenge-run" data-quiet>
    <div className="challenge-toolbar">
      <strong>{session.label} · 노말</strong>
      <button className="icon-button" type="button" aria-label={sound ? '게임 소리 끄기' : '게임 소리 켜기'}
        onClick={() => toggleSound(turn.stage)}>{sound ? <Volume2 size={21} /> : <VolumeX size={21} />}</button>
      <button className="icon-button" type="button" aria-label="도전 종료" onClick={() => setConfirm(true)}><Flag size={20} /></button>
    </div>
    <ChallengeScene stage={turn.stage} progress={progress} reaction={outcome && (outcome.correct ? 'correct' : 'missed')} />
    <div className="challenge-score-strip">
      <span>클리어 <strong>{progress.stage - 1}</strong></span>
      <span>정답 <strong>{progress.correct}</strong></span>
      <span>콤보 <strong>{progress.streak}</strong></span>
    </div>
    {outcome?.cleared ? <section className="challenge-clear surface">
      <span className="tag">{stageGoal}문제 정답</span>
      <h1>스테이지 {turn.stage} 클리어!</h1>
      <button className="button primary" type="button" onClick={() => advance(progress, outcome.bonus)}>
        다음 스테이지 <ArrowRight size={18} />
      </button>
    </section> : <>
      <article className="challenge-question surface">
        <div className="question-label"><strong>교재 {turn.question.no.toLocaleString('ko-KR')}번</strong>
          <span>정답 {progress.stageCorrect} / {stageGoal}</span></div>
        {!outcome && <ChallengeTimer key={turn.position} until={turn.until} duration={turn.duration} onExpire={expire} />}
        {outcome && <p className={'challenge-feedback ' + (outcome.correct ? 'success' : 'missed')} role="status">
          {outcome.correct ? outcome.bonus ? '콤보! 다음 문제 +2초' : '정답! 한 칸 전진' : outcome.answer === null ? '시간 초과 · 하트 −1' : '오답 · 하트 −1'}
        </p>}
        <h1 className="original question-prompt">{turn.question.prompt}</h1>
        <QuestionSource question={turn.question} />
      </article>
      <div className="challenge-controls">
        <OxButtons onAnswer={answer} disabled={!!outcome} selected={outcome?.answer ?? undefined} />
      </div>
    </>}
    {error && <ErrorNotice message="이 문제의 학습 기록을 저장하지 못했어요." />}
    {confirm && <Modal title="여기까지 기록할까요?" close={() => setConfirm(false)}>
      <p className="dialog-description">클리어한 스테이지와 정답 수를 결과 카드에 남겨요.</p>
      <div className="button-row">
        <button className="button secondary" type="button" onClick={() => setConfirm(false)}>계속 도전</button>
        <button className="button primary" type="button" onClick={stop}>기록하고 끝내기</button>
      </div>
    </Modal>}
  </div>
}
