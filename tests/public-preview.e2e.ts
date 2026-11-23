import { expect, test } from '@playwright/test'
import { generateExam } from '../src/exam/generate'
import { book, questions, seeded } from './fixtures'

test.skip(process.env.VITE_PUBLIC_PREVIEW !== '1', 'Run against the restricted public artifact.')

test('study, mock exams, and device backup work before HTTPS is available', async ({ page, baseURL }) => {
  const origin = 'http://ons.test'
  const app = new URL(baseURL!)
  await page.route(origin + '/**', async (route) => {
    const local = new URL(route.request().url())
    const response = await route.fetch({ url: app.origin + local.pathname + local.search })
    await route.fulfill({ response })
  })
  const home = origin + app.pathname
  await page.goto(home + '#/stage/1')
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false)
  await page.getByRole('button', { name: '전체 풀기', exact: true }).click()
  await page.getByRole('button', { name: '문제 풀기', exact: true }).click()
  await expect(page.getByText('교재 1번')).toBeVisible()
  await page.getByRole('button', { name: 'X 틀리다' }).click()
  await expect(page.getByText('오답노트에 담았어요.')).toBeVisible()
  await page.getByRole('button', { name: '다음' }).click()
  await page.reload()
  await expect(page.getByText('교재 2번')).toBeVisible()

  await page.goto(home + '#/exam')
  await page.getByRole('button', { name: '모의고사 시작' }).click()
  const options = page.getByRole('group', { name: '보기' }).getByRole('button')
  await expect(options).toHaveCount(4)
  await options.first().click()
  await page.reload()
  await expect(options.first()).toHaveAttribute('aria-pressed', 'true')

  await page.goto(home + '#/settings')
  await page.getByRole('button', { name: '이 기기 보관함' }).click()
  const saved = page.getByRole('list', { name: '기기에 저장된 자동 백업' }).getByRole('listitem')
  await saved.first().getByRole('button', { name: '복원' }).click()
  await expect(page.getByRole('dialog', { name: '이 백업으로 복원할까요?' })).toContainText('OX 답안 1개')
})

test('the public artifact exposes just stage one data and keeps direct routes locked', async ({ page, request, baseURL }) => {
  await page.goto('./')
  await expect(page.getByRole('complementary', { name: '임시 공개 범위' })).toBeVisible()
  const cards = page.locator('.stage-grid')
  await expect(cards.getByRole('link')).toHaveCount(1)
  for (const level of [2, 3]) {
    const card = cards.getByRole('button', { name: new RegExp('^' + level + '단계 .*정식 오픈 예정') })
    await card.click()
    const dialog = page.getByRole('dialog', { name: '정식오픈을 기다려주세요!' })
    await expect(dialog.locator('.teacher-' + level + '.teacher-reacting')).toBeVisible()
    await dialog.getByRole('button', { name: '확인', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(baseURL!)
  }
  await expect(page.getByRole('link', { name: /무한회독 챌린지/ })).toHaveCount(0)
  const manifestResponse = await request.get(new URL('book/manifest.json', baseURL).href)
  expect(manifestResponse.ok()).toBe(true)
  const manifest = await manifestResponse.json()
  expect(manifest.count).toBe(504)
  expect(manifest.stages.map((entry: { stage: number }) => entry.stage)).toEqual([1])
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  for (const level of [2, 3]) {
    const wanted = 'book/' + book.version + '/' + level + '-1-1.json'
    const path = new URL(wanted, baseURL).href
    expect((await request.get(path, { headers: { Accept: 'application/json' } })).status()).toBe(404)
    const status = await page.evaluate((url) => fetch(url).then((result) => result.status), path)
    expect(status).toBe(404)
    await page.goto('./#/stage/' + level)
    await expect(page.getByRole('heading', { name: level + '단계 잠김' })).toBeVisible()
  }
  await page.goto('./#/challenge')
  await expect(page.getByRole('heading', { name: '챌린지 잠김' })).toBeVisible()
  const song = await request.get(new URL('challenge/level-1.mp3', baseURL).href, { headers: { Accept: 'audio/mpeg' } })
  expect(song.status()).toBe(404)
})

test('the public mock offers a complete exam and its OX review uses stage one only', async ({ page }) => {
  await page.goto('./#/exam')
  await expect(page.getByText('1단계 교재 지문으로 실전처럼 풀어보세요.')).toBeVisible()
  await page.getByRole('button', { name: '모의고사 시작' }).click()
  await expect(page.getByRole('group', { name: '보기' }).getByRole('button')).toHaveCount(4)
  await page.getByRole('button', { name: '제출하기' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '시험 제출' }).click()
  await expect(page.getByText('모의고사 결과')).toBeVisible()
  await page.getByRole('button', { name: /^1번/ }).click()
  const options = page.locator('.review-option-heading strong')
  await expect(options).toHaveCount(4)
  const rows = await options.allTextContents()
  expect(rows).toHaveLength(4)
  expect(rows.every((row) => Number(row.match(/교재 (\d+)번/)?.[1]) <= 504)).toBe(true)
  await page.goto('./#/review')
  const review = page.getByRole('region', { name: '오답 목록' })
  await expect(review.getByRole('button', { name: /^교재 \d+번$/ })).toHaveCount(20)
  await review.getByRole('button', { name: /^교재 \d+번$/ }).first().click()
  await expect(page.getByRole('button', { name: 'O 옳다' })).toBeVisible()
})

test('old mixed exams and stage two records remain on device without showing restricted questions', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('complementary', { name: '임시 공개 범위' })).toBeVisible()
  await page.evaluate(({ examQuestions, version }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('police-constitution-ox')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const database = open.result
      const transaction = database.transaction(['exams', 'studies', 'reviews', 'attempts'], 'readwrite')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => { database.close(); reject(transaction.error) }
      const now = Date.now()
      transaction.objectStore('exams').put({
        id: 'mixed-exam', version, status: 'active', position: 0, startedAt: now, deadline: now + 600000,
        questions: examQuestions, responses: examQuestions.map(() => null),
      })
      transaction.objectStore('studies').put({
        key: 'stage-two-record', id: 'older-study', scope: { stage: 2 }, version, mode: 'order',
        numbers: [505], updatedAt: now, position: 0,
      })
      transaction.objectStore('reviews').put({
        id: 'pch-ox-505', type: 'ox', no: 505, stage: 2, chapterKey: '2-1-1', resolved: false, at: now,
      })
      transaction.objectStore('attempts').put({
        id: 'older-study:505', no: 505, at: now, sessionId: 'older-study', answer: 'X', correct: false,
      })
    }
  }), { examQuestions: generateExam(questions, seeded(7)), version: book.version })
  await page.reload()
  await expect(page.locator('.progress-value strong')).toHaveText('0')
  await expect(page.getByRole('link', { name: '학습 시작' })).toBeVisible()
  await page.goto('./#/study/stage-two-record')
  await expect(page.getByRole('heading', { name: '2단계 잠김' })).toBeVisible()
  await page.goto('./#/exam/mixed-exam')
  await expect(page.getByRole('heading', { name: '이 모의고사는 잠겨 있어요' })).toBeVisible()
  await page.goto('./#/exam')
  await expect(page.getByRole('button', { name: '모의고사 시작' })).toBeVisible()
  await page.goto('./#/review')
  await expect(page.getByRole('heading', { name: '복습할 문제가 없어요.' })).toBeVisible()
})
