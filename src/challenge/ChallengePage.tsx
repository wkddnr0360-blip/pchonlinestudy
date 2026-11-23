import { useEffect, useRef, useState } from 'react'
import type { BookIndex, Stage } from '../book/types'
import { getQuestions } from '../book/catalog'
import { storeBestScore } from '../storage/challenge'
import type { ChallengeScore } from '../storage/db'
import { ChallengeResult } from './ChallengeResult'
import { ChallengeRun, type Session } from './ChallengeRun'
import { ChallengeSetup } from './ChallengeSetup'
import { createGameMusic } from './gameAudio'
import { challengeScopes, questionDraw, type Progress } from './rules'
import './challenge.css'

export default function ChallengePage({ book }: { book: BookIndex }) {
  const [scope, setScope] = useState('all')
  const [sound, setSound] = useState(true)
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<Session>()
  const [result, setResult] = useState<ChallengeScore>()
  const [best, setBest] = useState(false)
  const [error, setError] = useState('')
  const [music] = useState(createGameMusic)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      music.stop()
    }
  }, [music])

  function toggleSound(stage = 1) {
    music.toggle(!sound, stage, !!session && !result)
    setSound(!sound)
  }

  async function start() {
    if (busy) return
    setBusy(true)
    setError('')
    music.play(1)
    try {
      const sets = await Promise.all(([2, 3] as Stage[]).map((stage) => getQuestions(book, {
        stage, chapterKey: scope === 'all' ? undefined : stage + '-' + scope,
      })))
      if (!live.current) return
      const draw = questionDraw(sets.flat())
      const first = draw(1)
      if (!first) throw new Error('선택한 범위에 출제할 문제가 없어요.')
      const label = challengeScopes(book).find((item) => item.key === scope)?.label ?? '전범위'
      setSession({ id: crypto.randomUUID(), scope, label, draw, first })
      window.scrollTo(0, 0)
    } catch (failure) {
      music.stop()
      setError(failure instanceof Error ? failure.message : '게임을 시작하지 못했어요.')
    } finally { setBusy(false) }
  }

  function finish(progress: Progress) {
    if (!session || result) return
    music.stop()
    const score = { scope: session.scope, cleared: progress.stage - 1, correct: progress.correct, at: Date.now() }
    setResult(score)
    setBest(false)
    void storeBestScore(score).then(setBest).catch(() => setError('이 기기에 기록을 저장하지 못했어요.'))
    window.scrollTo(0, 0)
  }

  return <div className="challenge-page">
    {result && session ? <ChallengeResult score={result} label={session.label} best={best} error={error}
      retry={() => { setResult(undefined); setSession(undefined); setError('') }} />
      : session ? <ChallengeRun key={session.id} session={session} music={music} sound={sound} toggleSound={toggleSound} finish={finish} />
        : <ChallengeSetup book={book} scope={scope} setScope={setScope} sound={sound}
          toggleSound={() => toggleSound()} start={() => void start()} busy={busy} error={error} />}
  </div>
}
