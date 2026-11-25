import { expect, test } from '@playwright/test'

for (const oldEntry of ['index-C_VShATN.js', 'index-DFWwxs5v.js']) {
  test(`cached HTML using ${oldEntry} starts the current app`, async ({ page, baseURL }) => {
    const entry = new URL('assets/' + oldEntry, baseURL).href
    await page.route(baseURL!, (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="ko"><head><meta charset="UTF-8"></head><body>
        <div id="root"></div><script type="module" src="${entry}"></script></body></html>`,
    }), { times: 1 })

    await page.goto('./')
    await expect(page.getByRole('heading', { name: '헌법의 핵심은 무한회독' })).toBeVisible()
    await expect(page.locator('link[rel="stylesheet"][href*="/assets/index-"]')).toHaveCount(1)
  })
}

test('a missing app script shows a retry that preserves the study route', async ({ page }) => {
  await page.route('**/assets/index-*.js', (route) => route.fulfill({
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  }), { times: 1 })

  await page.goto('./#/stage/1')
  await expect(page.getByText('학습 화면을 불러오지 못했어요.')).toBeVisible()
  await page.getByRole('link', { name: '다시 불러오기' }).click()
  await expect(page).toHaveURL(/\?ons-retry=\d+#\/stage\/1$/)
  await expect(page.getByRole('button', { name: '전체 풀기', exact: true })).toBeVisible()

  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  const response = await page.goto('./?ons-retry=2#/stage/1')
  expect(response?.fromServiceWorker()).toBe(false)
  await expect(page.getByRole('button', { name: '전체 풀기', exact: true })).toBeVisible()
})
