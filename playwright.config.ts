import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 테스트 설정.
 * - 이미 실행 중인 서버(기본 http://localhost:8080)를 대상으로 한다. 서버를 띄우지 않으므로 webServer 설정은 없다.
 * - 다른 주소를 쓰려면 환경변수 BASE_URL 을 지정한다. 예) BASE_URL=http://localhost:9090 npm run test:e2e
 * - 이 앱은 파일 DB(H2)를 쓰므로 주문을 만드는 테스트는 같은 파일을 공유하는 다른 테스트와 겹치지 않게 순서대로 실행한다.
 */
export default defineConfig({
  testDir: './src/test/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
