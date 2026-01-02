import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    extraHTTPHeaders: {
      'X-User-ID': process.env.TEST_USER_ID || 'e2e-test-user',
      'Content-Type': 'application/json',
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: /api\/.*\.spec\.ts/,
      use: {
        // API tests don't need a browser
      },
    },
    {
      name: 'flows',
      testMatch: /flows\/.*\.spec\.ts/,
      dependencies: ['api'],
      use: {
        // Flow tests may use browser for UI validation
      },
    },
  ],
})
