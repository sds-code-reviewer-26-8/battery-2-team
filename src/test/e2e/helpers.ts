import { expect, type Locator, type Page } from '@playwright/test';

/** 이 앱의 로그인 계정은 admin / admin 하나뿐이다. */
export const ADMIN = { username: 'admin', password: 'admin' };

/** 기본 시뮬레이션 수량: 네 나라 각 3,000K (주문 추가 화면의 기본 총량 12,000K 와 같다) */
export const DEFAULT_ORDERS = { CHINA: 3000, JAPAN: 3000, VIETNAM: 3000, INDONESIA: 3000 };

/** 로그인하고 주문 목록 화면까지 이동한다. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(ADMIN.username);
  await page.locator('input[name="password"]').fill(ADMIN.password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/orders(;.*)?$/);
}

/**
 * 주문 목록에서 주문 번호가 정확히 id 인 행. 목록 화면에 있는 상태에서 쓴다.
 * 글자로 찾으면(hasText: '#42') '#142' 같은 번호도 걸리므로, 취소 주문이 남아 번호가 커진 뒤에는 어긋난다.
 * 그래서 그 주문으로 가는 링크(/orders/{id})가 들어 있는 행을 찾는다.
 */
export const orderRow = (page: Page, id: number): Locator =>
  page.locator('table.grid tbody tr.clickable').filter({ has: page.locator(`a[href="/orders/${id}"]`) });

/** 주문 목록의 "전체" 건수를 읽는다. (목록 화면으로 이동한다) */
export async function orderTotalCount(page: Page): Promise<number> {
  await page.goto('/orders');
  const text = await page.locator('.filters a.chip').first().locator('.count').innerText();
  return parseInt(text.replace(/,/g, ''), 10);
}

/** 주문 목록 상단 필터 칩('확정', '진행' 등)의 건수를 읽는다. 목록 화면에 있는 상태에서 호출한다. */
export async function chipCount(page: Page, label: string): Promise<number> {
  const text = await page.locator('.filters a.chip', { hasText: label }).first().locator('.count').innerText();
  return parseInt(text.replace(/,/g, ''), 10);
}

/** 현재 마스터(기준값) 번호. 확정 요청에 함께 보내야 한다. */
export async function masterVersion(page: Page): Promise<number> {
  const res = await page.request.get('/api/master');
  expect(res.status()).toBe(200);
  return (await res.json()).version as number;
}

/**
 * 화면으로 주문 1건을 만든다: 시뮬레이션 실행 → 고객사 입력(필수) → 첫 번째 안(운항비 최소)으로 확정.
 * 확정되면 주문 상세로 이동하며, 주문 번호를 돌려준다. 상태는 "확정"이다.
 */
export async function createOrder(page: Page, customerName = 'E2E 고객사'): Promise<number> {
  await page.goto('/orders/new');
  await page.locator('#runBtn').click();
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#customerName').fill(customerName); // 고객사는 필수 입력이다
  await page.locator('#confirmBtn').click();
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  return Number(new URL(page.url()).pathname.split('/').pop());
}

/** 주문 상세의 변경 번호(version). 상태 변경 폼에 숨어 있다. 확정·진행 상태일 때만 읽을 수 있다. */
export async function orderVersion(page: Page, id: number): Promise<number> {
  await page.goto(`/orders/${id}`);
  const value = await page.locator('form.status-form input[name="version"]').first().inputValue();
  return Number(value);
}

/**
 * 테스트가 만든 주문이 아직 취소할 수 있는 상태(확정·진행)이면 취소한다. 주문을 지우는 것이 아니다:
 * 이 앱은 취소해도 주문을 지우지 않고 '취소' 상태로 남기므로, 실행할 때마다 취소 주문이 DB 에 쌓인다.
 * 그래서 E2E 는 매번 새로 띄운 인메모리 DB 서버에서 실행한다(playwright.config.ts 설명 참고).
 * 이미 없거나 더 바꿀 수 없는 상태(완료·취소)이면 건너뛴다. 화면을 거치지 않고 API 로 처리한다.
 */
export async function cancelOrderIfOpen(page: Page, id: number): Promise<void> {
  try {
    const res = await page.request.get(`/api/orders/${id}`);
    if (!res.ok()) return;
    const order = await res.json();
    if (order.nextStatuses.length === 0) return;
    await page.request.post(`/api/orders/${id}/status`, {
      data: { status: 'CANCELED', version: order.version },
    });
  } catch (e) {
    // 정리 실패는 테스트 결과에 영향을 주지 않지만, 원인을 알 수 있게 남긴다
    console.warn(`주문 #${id} 정리(취소) 실패: ${e}`);
  }
}
