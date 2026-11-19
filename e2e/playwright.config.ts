// Browser scenarios: the built web client, each test in a fresh browser whose storage starts empty.
// Run with `just e2e` (builds the client first). Never point it at real data.
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, ROOT, SERVER_COMMAND, SERVER_ENV } from './server.ts';

export default defineConfig({
  testDir: '.',
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../.e2e-report' }]] : 'list',
  outputDir: '../.e2e-results',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1000, height: 700 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'web', testIgnore: /desktop\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop', testMatch: /desktop\.spec\.ts/ },
  ],
  webServer: {
    command: `node ${SERVER_COMMAND.join(' ')}`,
    cwd: ROOT,
    url: BASE_URL,
    reuseExistingServer: false,
    env: SERVER_ENV,
  },
});
