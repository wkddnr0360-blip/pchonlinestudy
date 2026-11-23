import { Heart } from 'lucide-react'
import { Teacher } from '../ui/Teacher'
import { stageGoal, startingLives, themeFor, type Progress } from './rules'

export function ChallengeScene({ stage, progress, reaction = '' }: {
  stage: number; progress: Progress; reaction?: 'correct' | 'missed' | ''
}) {
  const theme = themeFor(stage)
  const checkpoint = progress.stage > stage ? stageGoal : progress.stageCorrect
  return <section className={'challenge-scene scene-' + theme.name} aria-label={'스테이지 ' + stage + ' ' + theme.label}>
    <div className="scene-shade" aria-hidden="true" />
    <header className="scene-head">
      <div><span>스테이지 {stage}</span><strong>{theme.label}</strong></div>
      <div className="life-row" aria-label={'남은 하트 ' + progress.lives + '개'}>
        {Array.from({ length: startingLives }, (_, index) => (
          <Heart key={index} size={19} fill={index < progress.lives ? 'currentColor' : 'none'} aria-hidden="true" />
        ))}
      </div>
    </header>
    <div className="challenge-trail" aria-hidden="true">
      {Array.from({ length: stageGoal + 1 }, (_, index) => <span key={index} className={index <= checkpoint ? 'passed' : ''} />)}
    </div>
    <div className={'challenge-player ' + reaction} style={{ left: 9 + checkpoint * 16.4 + '%' }} aria-hidden="true">
      <Teacher stage={theme.number} key={reaction + checkpoint} className={reaction === 'correct' ? 'win-motion' : reaction === 'missed' ? 'encourage-motion' : ''} />
    </div>
  </section>
}
