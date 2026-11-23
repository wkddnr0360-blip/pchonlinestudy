import { useEffect, useState } from 'react'
import { ClipboardList, Download, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ChallengeScore } from '../storage/db'
import { ErrorNotice } from '../ui/Controls'
import { ChallengeScene } from './ChallengeScene'
import { initialProgress } from './rules'
import { makeScoreCard } from './shareCard'

export function ChallengeResult({ score, label, best, retry, error }: {
  score: ChallengeScore; label: string; best: boolean; retry: () => void; error: string
}) {
  const [card, setCard] = useState<File>()
  useEffect(() => {
    let active = true
    void makeScoreCard(score, label).then((file) => { if (active) setCard(file) }).catch(() => undefined)
    return () => { active = false }
  }, [score, label])

  async function share() {
    if (!card) return
    const data = { files: [card], title: '박철한 온스 도전 기록' }
    if (navigator.canShare?.(data)) {
      try { await navigator.share(data); return }
      catch (failure) { if (failure instanceof DOMException && failure.name === 'AbortError') return }
    }
    const url = URL.createObjectURL(card)
    const download = document.createElement('a')
    download.href = url
    download.download = card.name
    download.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="challenge-result">
    <ChallengeScene stage={Math.max(score.cleared, 1)} progress={{ ...initialProgress, stage: score.cleared + 1, lives: 0 }} />
    <section className="challenge-result-card surface" aria-label="도전 기록 카드">
      <span className="tag">{best ? '새 최고 기록' : '무한회독 챌린지'}</span>
      <h1><strong>{score.cleared.toLocaleString('ko-KR')}</strong> 스테이지 클리어</h1>
      <p>박철한 온스 · 노말 모드 · {label}</p>
      <p>정답 {score.correct.toLocaleString('ko-KR')}개</p>
      <div className="button-row">
        <button className="button primary" type="button" disabled={!card} onClick={() => void share()}>
          <Download size={18} /> 기록 카드 공유
        </button>
        <button className="button secondary" type="button" onClick={retry}><RotateCcw size={18} /> 다시 도전</button>
        <Link className="button secondary" to="/review"><ClipboardList size={18} /> 오답노트</Link>
      </div>
      {error && <ErrorNotice message={error} />}
    </section>
  </div>
}
