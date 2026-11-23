import { expect, test } from '@playwright/test'

test('Canary branding, one-time notice and every teacher reaction', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('박철한 온스')
  await expect(page.getByRole('heading', { name: '헌법의 핵심은 무한회독' })).toBeVisible()
  const notice = page.getByRole('complementary', { name: '버전 안내' })
  await expect(notice).toContainText('Canary 1.2.0')
  await notice.getByRole('button', { name: '확인' }).click()
  await page.reload()
  await expect(notice).toHaveCount(0)
  await expect(page.getByText('이 정도는 가볍게 풀리네요!')).toBeVisible()
  for (const [index, name] of ['웃음', '활짝 웃는 응원', '불꽃 응원'].entries()) {
    const level = index + 1
    const control = page.locator('.stage-grid').getByRole('button', { name: level + '단계 철한쌤 ' + name + ' 모션' })
    await control.click()
    await expect(control.locator('.teacher-reacting')).toBeVisible()
    await expect(control.locator('.teacher-particles-' + level)).toBeVisible()
    await expect(page).not.toHaveURL(/stage/)
  }
  const manifestPath = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await (await page.request.get(new URL(manifestPath!, page.url()).href)).json()
  expect(manifest.name).toBe('박철한 온스')
  expect(manifest.short_name).toBe('박철한 온스')
})

test('automatic device backup follows study mutations and can be restored', async ({ page }) => {
  await page.goto('./#/settings')
  await page.getByRole('button', { name: '이 기기 보관함' }).click()
  await expect(page.getByText(/최근 저장/)).toBeVisible()
  await page.goto('./#/stage/1')
  await page.getByRole('button', { name: /제1장 헌법의 개념과 헌법학/ }).click()
  await page.getByRole('button', { name: '문제 풀기', exact: true }).click()
  await expect(page.getByText('교재 1번')).toBeVisible()
  await page.getByRole('button', { name: 'X 틀리다' }).click()
  await expect(page.getByText('오답노트에 담았어요.')).toBeVisible()
  await page.getByRole('link', { name: '학습 기록 설정' }).click()
  const entries = page.getByRole('list', { name: '기기에 저장된 자동 백업' }).getByRole('listitem')
  await expect.poll(() => entries.count()).toBeGreaterThan(1)
  await entries.first().getByRole('button', { name: '복원' }).click()
  const dialog = page.getByRole('dialog', { name: '이 백업으로 복원할까요?' })
  await expect(dialog).toContainText('OX 답안 1개')
  await dialog.getByRole('button', { name: '복원하기' }).click()
  await expect(page.getByText('학습 기록을 복원했습니다.')).toBeVisible()
})

test('folder target writes a valid portable backup using a browser directory handle', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: () => navigator.storage.getDirectory() })
  })
  await page.goto('./#/settings')
  await page.getByRole('button', { name: '폴더 선택' }).click()
  await expect(page.getByText(/최근 저장/)).toBeVisible()
  const filename = await page.locator('.backup-location small').textContent()
  const backup = await page.evaluate(async (name) => {
    const folder = await navigator.storage.getDirectory()
    const handle = await folder.getFileHandle(name)
    return JSON.parse(await (await handle.getFile()).text())
  }, filename!)
  expect(backup.format).toBe('police-constitution-ox')
  expect(backup).not.toHaveProperty('backupTargets')
})

test('fun mode plays one selected correct-answer sound and settings persist', async ({ page }) => {
  await page.addInitScript(() => {
    let count = 0
    Object.defineProperty(window, 'testTones', { get: () => count })
    const start = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (...args: Parameters<typeof start>) {
      count++
      return start.apply(this, args)
    }
  })
  await page.goto('./#/settings')
  await page.getByRole('switch', { name: '터치 효과음' }).uncheck()
  await page.getByRole('switch', { name: /재미 모드/ }).check()
  const sounds = page.getByRole('combobox', { name: '정답 효과음' })
  await expect(sounds.getByRole('option')).toHaveCount(3)
  await sounds.selectOption('pixel')
  await expect(sounds).toHaveValue('pixel')
  await page.reload()
  await expect(sounds).toHaveValue('pixel')
  await expect(page.getByRole('switch', { name: '터치 효과음' })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: /재미 모드/ })).toBeChecked()
  await page.goto('./#/stage/1')
  await page.getByRole('button', { name: /제1장 헌법의 개념과 헌법학/ }).click()
  await page.getByRole('button', { name: '문제 풀기', exact: true }).click()
  const countTones = () => page.evaluate(() => (window as Window & { testTones?: number }).testTones)
  const initialTones = await countTones() ?? 0
  await page.getByRole('button', { name: 'O 옳다' }).click()
  await expect.poll(countTones).toBe(initialTones + 3)
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByRole('button', { name: 'X 틀리다' }).click()
  await expect(page.getByText('오답노트에 담았어요.')).toBeVisible()
  expect(await countTones()).toBe(initialTones + 3)
})
