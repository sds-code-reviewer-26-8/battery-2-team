import { test, expect, type Page } from '@playwright/test';
import { cancelOrderIfOpen, login, orderTotalCount } from './helpers';

/**
 * PR #33 리뷰(sy9169park) 5·6번 반영으로 보강한 납기 E2E.
 * - R-DUE1: '가능한 빨리'를 해제한 직후 날짜는 빈 칸이고 빨간 표시가 없다. 날짜 없이 확정하면 화면이 막는다.
 * - R-DUE2: 날짜 칸에 범위 밖 날짜(4일·51일)를 직접 입력하면 확정이 막힌다.
 * - R-DUE3: 브라우저 시계가 서버보다 하루 늦어도, 화면은 서버 기준 '오늘'로 범위를 정하므로 화면이 허용한 날짜로 확정된다.
 * 이미 실행 중인 서버(playwright.config.ts 의 baseURL, 인메모리 DB 서버 권장)를 대상으로 한다.
 */
test.describe.configure({ timeout: 20_000 });

const NEED_DUE = "필요 납기일을 선택하거나 '가능한 빨리'를 체크하세요";
const OUT_OF_RANGE = '필요 납기일은 오늘부터 5~50일 사이로 선택하세요';

/** 테스트 러너(=서버와 같은 PC) 기준 오늘 + days 를 yyyy-MM-dd 로 */
function serverDate(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 주문 추가 화면을 열고, 납기 규칙을 받아 '가능한 빨리'가 켜질 때까지 기다린 뒤 시뮬레이션한다 */
async function openAndSimulate(page: Page): Promise<void> {
  await page.goto('/orders/new');
  await expect(page.locator('#dueAsap')).toBeEnabled();
  await page.locator('#runBtn').click();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#options .option')).toHaveCount(3);
}

test.describe('필요 납기 리뷰 보강', () => {
  test('R-DUE1 해제 직후 날짜는 빈 칸·빨간 표시 없음, 날짜 없이 확정하면 막힘', async ({ page }) => {
    await login(page);
    const before = await orderTotalCount(page);
    await openAndSimulate(page);

    await page.locator('#dueAsap').uncheck();
    await expect(page.locator('#dueDate')).toBeEnabled();
    await expect(page.locator('#dueDate')).toHaveValue('');
    await expect(page.locator('#options .over-due')).toHaveCount(0);
    await expect(page.locator('#options')).not.toContainText('납기 초과');

    await page.locator('#confirmBtn').click();
    await expect(page.locator('#confirmError')).toBeVisible();
    await expect(page.locator('#confirmError')).toContainText(NEED_DUE);
    await expect(page).toHaveURL(/\/orders\/new$/);
    expect(await orderTotalCount(page)).toBe(before);
  });

  test('R-DUE2 범위 밖 날짜를 직접 입력하면 확정이 막힘 (4일·51일)', async ({ page }) => {
    await login(page);
    const before = await orderTotalCount(page);
    await openAndSimulate(page);
    await page.locator('#dueAsap').uncheck();

    for (const days of [4, 51]) {
      await page.locator('#dueDate').fill(serverDate(days));
      await page.locator('#confirmBtn').click();
      await expect(page.locator('#confirmError')).toBeVisible();
      await expect(page.locator('#confirmError')).toContainText(OUT_OF_RANGE);
      await expect(page).toHaveURL(/\/orders\/new$/);
    }
    expect(await orderTotalCount(page)).toBe(before);
  });

  test('R-DUE3 브라우저 시계가 하루 늦어도 서버 기준 범위로 확정됨', async ({ page }) => {
    await login(page);
    // 브라우저의 Date 만 하루 전으로 고정한다(자정 무렵·시간대 차이를 흉내). 타이머는 그대로 동작한다.
    await page.clock.setFixedTime(new Date(Date.now() - 86_400_000));
    let id: number | undefined;
    try {
      await openAndSimulate(page);
      const date = page.locator('#dueDate');
      // 범위는 브라우저 시계가 아니라 서버가 알려 준 '오늘' 기준이다
      await expect(date).toHaveAttribute('min', serverDate(5));
      await expect(date).toHaveAttribute('max', serverDate(50));

      await page.locator('#dueAsap').uncheck();
      await date.fill(serverDate(5)); // 화면이 허용하는 가장 이른 날짜
      await page.locator('#confirmBtn').click();
      await expect(page).toHaveURL(/\/orders\/\d+$/);
      id = Number(new URL(page.url()).pathname.split('/').pop());
    } finally {
      if (id) await cancelOrderIfOpen(page, id);
    }
  });
});
