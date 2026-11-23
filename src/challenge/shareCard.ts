import type { ChallengeScore } from '../storage/db'
import { themeFor } from './rules'

function loadImage(path: string) {
  const image = new Image()
  image.src = import.meta.env.BASE_URL + path
  return image.decode().then(() => image)
}

export async function makeScoreCard(score: ChallengeScore, scopeLabel: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 820
  canvas.height = 900
  const context = canvas.getContext('2d')
  if (!context) return
  const theme = themeFor(Math.max(score.cleared, 1))
  context.fillStyle = '#171a37'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = false
  try {
    const [background, teacher] = await Promise.all([
      loadImage('challenge/archive-scenes.webp'),
      loadImage('characters/teacher.webp'),
    ])
    const frame = background.width / 3
    context.drawImage(background, frame * (theme.number - 1), background.height * .16,
      frame, background.height * .52, 0, 0, 820, 440)
    const sprite = teacher.width / 3
    context.drawImage(teacher, sprite * (theme.number - 1), 0, sprite, teacher.height, 250, 100, 320, 320)
  } catch { /* The record can still be exported with its score when offline artwork is missing. */ }

  context.fillStyle = '#262b59'
  context.fillRect(40, 454, 740, 418)
  context.strokeStyle = '#7d87ed'
  context.lineWidth = 3
  context.strokeRect(40, 454, 740, 418)
  context.textAlign = 'center'
  context.fillStyle = '#f1efff'
  context.font = 'bold 42px system-ui, sans-serif'
  context.fillText('무한회독 챌린지', 410, 526)
  context.font = 'bold 87px system-ui, sans-serif'
  context.fillStyle = '#ffe396'
  context.fillText(score.cleared.toLocaleString('ko-KR'), 410, 652)
  context.font = 'bold 31px system-ui, sans-serif'
  context.fillStyle = '#f1efff'
  context.fillText('스테이지 클리어', 410, 699)
  context.font = '28px system-ui, sans-serif'
  context.fillText('정답 ' + score.correct.toLocaleString('ko-KR') + '개 · 노말 모드', 410, 756, 650)
  context.font = '24px system-ui, sans-serif'
  context.fillStyle = '#c4c9f7'
  context.fillText(scopeLabel, 410, 803, 650)
  context.fillText('박철한 온스', 410, 843)
  return new Promise<File | undefined>((resolve) => canvas.toBlob((blob) => {
    resolve(blob ? new File([blob], '박철한-온스-도전기록.png', { type: 'image/png' }) : undefined)
  }, 'image/png'))
}
