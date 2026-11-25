import { defineConfig, devices } from '@playwright/test'

const base = process.env.PAGES_BASE ?? '/'
const baseURL = 'http://127.0.0.1:4173' + base

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
      },
    },
    {
      name: 'iphone',
      testMatch: '**/startup.e2e.ts',
      use: {
        ...devices['iPhone 13'],
        launchOptions: { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE },
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
