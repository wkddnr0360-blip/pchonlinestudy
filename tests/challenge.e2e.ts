import { expect, test } from '@playwright/test'
import { questions } from './fixtures'

test('play the normal game, reach the next scene and save a shareable result', async ({ page }) => {
  await page.goto('./#/challenge')
  await expect(page.getByRole('heading', { name: '무한회독 챌린지' })).toBeVisible()
  await page.getByRole('combobox', { name: '도전 범위' }).selectOption('1-1')
  await page.getByRole('button', { name: '게임 소리 끄기' }).click()
  await page.getByRole('button', { name: '도전 시작' }).click()
  await expect(page.getByRole('region', { name: '스테이지 1 햇살 서재' })).toBeVisible()

  const seen = new Set<number>()
  const current = page.locator('.challenge-question .question-label strong')
  for (let turn = 0; turn < 5; turn++) {
    await expect(page.getByRole('button', { name: 'O 옳다' })).toBeEnabled()
    const no = Number((await current.textContent())?.replace(/\D/g, ''))
    const row = questions[no - 1]
    expect([2, 3]).toContain(row.stage)
    expect(row.part).toBe(1)
    expect(row.chapter).toBe(1)
    expect(seen.has(no)).toBe(false)
    seen.add(no)
    await page.getByRole('button', { name: row.answer === 'O' ? 'O 옳다' : 'X 틀리다' }).click()
    if (turn === 2) await expect(page.getByText('콤보! 다음 문제 +2초')).toBeVisible()
    if (turn < 4) await expect(current).not.toHaveText('교재 ' + no.toLocaleString('ko-KR') + '번')
  }
  await expect(page.getByRole('heading', { name: '스테이지 1 클리어!' })).toBeVisible()
  await page.getByRole('button', { name: '다음 스테이지' }).click()
  await expect(page.getByRole('region', { name: '스테이지 2 보랏빛 기록관' })).toBeVisible()
  await page.getByRole('button', { name: '도전 종료' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '기록하고 끝내기' }).click()
  await expect(page.getByRole('heading', { name: '1 스테이지 클리어' })).toBeVisible()
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: () => false }))
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '기록 카드 공유' }).click()
  expect((await download).suggestedFilename()).toBe('박철한-온스-도전기록.png')
  await page.getByRole('button', { name: '다시 도전' }).click()
  await expect(page.getByText(/내 최고 기록 · 1 스테이지/)).toBeVisible()
})

test('timeout spends a heart and keeps the textbook number for review', async ({ page }) => {
  await page.clock.install()
  await page.goto('./#/challenge')
  await page.getByRole('combobox', { name: '도전 범위' }).selectOption('1-1')
  await page.getByRole('button', { name: '게임 소리 끄기' }).click()
  await page.getByRole('button', { name: '도전 시작' }).click()
  const number = (await page.locator('.challenge-question .question-label strong').textContent())!
  await page.clock.fastForward(41000)
  await expect(page.getByText('시간 초과 · 하트 −1')).toBeVisible()
  await expect(page.getByLabel('남은 하트 2개')).toBeVisible()
  await page.getByRole('button', { name: '도전 종료' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '기록하고 끝내기' }).click()
  await page.locator('.challenge-result-card').getByRole('link', { name: '오답노트' }).click()
  await expect(page.getByRole('button', { name: number, exact: true })).toBeVisible()
})
