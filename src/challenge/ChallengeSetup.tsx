import { useLiveQuery } from 'dexie-react-hooks'
import { Gamepad2, Play, Volume2, VolumeX } from 'lucide-react'
import type { BookIndex } from '../book/types'
import { db } from '../storage/db'
import { ErrorNotice } from '../ui/Controls'
import { ChallengeScene } from './ChallengeScene'
import { challengeScopes, initialProgress } from './rules'

export function ChallengeSetup({ book, scope, setScope, sound, toggleSound, start, busy, error }: {
  book: BookIndex; scope: string; setScope: (key: string) => void; sound: boolean
  toggleSound: () => void; start: () => void; busy: boolean; error: string
}) {
  const best = useLiveQuery(() => db.challengeScores.get(scope), [scope])
  const chapters = challengeScopes(book)
  const parts = [...new Set(chapters.map(({ part }) => part))]
  return <div className="challenge-lobby">
    <ChallengeScene stage={1} progress={initialProgress} />
    <section className="surface challenge-intro">
      <span className="tag"><Gamepad2 size={16} /> 노말 모드</span>
      <h1>무한회독 챌린지</h1>
      <p>2·3단계 교재 지문에 도전해 철한쌤을 전진시켜요.</p>
      <div className="challenge-rules"><span>하트 3개</span><span>정답 5개마다 클리어</span><span>3연속 정답 +2초</span></div>
      <div className="field">
        <label htmlFor="challenge-scope">도전 범위</label>
        <select id="challenge-scope" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="all">전범위</option>
          {parts.map((part) => <optgroup key={part} label={part}>
            {chapters.filter((chapter) => chapter.part === part).map((chapter) => <option key={chapter.key} value={chapter.key}>{chapter.label}</option>)}
          </optgroup>)}
        </select>
      </div>
      <div className="challenge-launch">
        <button className="button primary" type="button" data-quiet disabled={busy} onClick={start}>
          <Play size={18} />{busy ? '문제 불러오는 중' : '도전 시작'}
        </button>
        <button className="icon-button" type="button" data-quiet aria-label={sound ? '게임 소리 끄기' : '게임 소리 켜기'}
          onClick={toggleSound}>{sound ? <Volume2 size={21} /> : <VolumeX size={21} />}</button>
      </div>
      {best && <p className="challenge-best">내 최고 기록 · {best.cleared} 스테이지 클리어 · 정답 {best.correct}개</p>}
      {error && <ErrorNotice message={error} />}
      <a className="music-credit" href={import.meta.env.BASE_URL + 'challenge/CREDITS.txt'} target="_blank" rel="noreferrer">배경음악 출처</a>
    </section>
  </div>
}
