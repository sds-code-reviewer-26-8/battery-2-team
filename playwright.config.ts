import { defineConfig, devices } from '@playwright/test';

// battery-2-team E2E 설정
// 앱을 먼저 띄운 뒤(.\gradlew.bat bootRun) `npm run test:e2e` 로 실행한다.
export default defineConfig({
  testDir: './src/test/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
