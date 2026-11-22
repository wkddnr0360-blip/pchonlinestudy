import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, type Page } from '@playwright/test'

const base = process.env.PAGES_BASE ?? '/'
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

async function serveReleases() {
  let directory = resolve('dist')
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (!pathname.startsWith(base)) return response.writeHead(404).end()
    const path = resolve(directory, pathname.slice(base.length) || 'index.html')
    if (!path.startsWith(directory + sep)) return response.writeHead(404).end()
    try {
      const contents = await readFile(path)
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'max-age=600',
      }).end(contents)
    } catch { response.writeHead(404).end() }
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server address unavailable')
  return {
    baseURL: 'http://127.0.0.1:' + address.port + base,
    publish: (path: string) => { directory = path },
    close: () => server.close(),
  }
}

function entryScript(page: Page) {
  return page.locator('script[type="module"][src]').getAttribute('src')
}

test('two deployed releases preserve offline study and wait for an active exam in another tab', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'Two-tab lifecycle is shared by the desktop and mobile Chromium projects.')
  test.setTimeout(60000)
  const next = await mkdtemp(resolve(tmpdir(), 'ons-next-build-'))
  const running = await serveReleases()
  try {
    await page.goto(running.baseURL)
    await expect(page.getByRole('heading', { name: '헌법의 핵심은 무한회독' })).toBeVisible()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    const original = await entryScript(page)

    await page.getByRole('link', { name: '학습 시작' }).click()
    await page.getByRole('button', { name: /제1장 헌법의 개념과 헌법학/ }).click()
    await page.getByRole('button', { name: '문제 풀기', exact: true }).click()
    await page.getByRole('button', { name: 'O 옳다' }).click()
    await expect(page.getByText('정답이에요!')).toBeVisible()
    await page.getByRole('link', { name: '박철한 온스 홈' }).click()

    const exam = await context.newPage()
    await exam.goto(running.baseURL + '#/exam')
    await exam.getByRole('button', { name: '모의고사 시작' }).click()
    const choice = exam.getByRole('group', { name: '보기' }).getByRole('button').first()
    await choice.click()
    await expect(choice).toHaveAttribute('aria-pressed', 'true')
    const examURL = exam.url()

    await promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', next])
    running.publish(next)
    await page.bringToFront()
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    const update = page.getByRole('complementary', { name: '앱 업데이트' })
    await expect(update).toContainText('새 버전 준비 완료', { timeout: 15000 })
    const apply = update.getByRole('button', { name: '업데이트 적용' })
    await expect(apply).toBeDisabled()
    await expect(update).toContainText('모의고사를 마친 뒤')
    expect(await entryScript(page)).toBe(original)
    await expect(exam).toHaveURL(examURL)
    await expect(choice).toHaveAttribute('aria-pressed', 'true')

    await exam.getByRole('button', { name: '제출하기' }).click()
    await exam.getByRole('dialog').getByRole('button', { name: '시험 제출' }).click()
    await expect(exam.getByText('모의고사 결과')).toBeVisible()
    await expect(apply).toBeEnabled()
    await Promise.all([page.waitForEvent('load'), apply.click()])
    await expect(page.getByRole('heading', { name: '헌법의 핵심은 무한회독' })).toBeVisible()
    expect(await entryScript(page)).not.toBe(original)
    expect(await entryScript(exam)).toBe(original)
    const controller = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)
    expect(controller).toBeTruthy()
    await exam.waitForFunction((expected) => navigator.serviceWorker.controller?.scriptURL === expected, controller)
    const priorChunk = await exam.evaluate(async (path) => (await fetch(path!)).status, original)
    expect(priorChunk).toBe(200)
    await expect(page.locator('.progress-value strong')).toHaveText('1')

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: '헌법의 핵심은 무한회독' })).toBeVisible()
    await page.getByRole('link', { name: '이어 풀기' }).click()
    await expect(page.getByText('정답이에요!')).toBeVisible()
  } finally {
    running.close()
    await rm(next, { recursive: true, force: true })
  }
})
