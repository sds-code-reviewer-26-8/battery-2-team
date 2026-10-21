import { expect, type Page } from '@playwright/test';

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

/** 주문 목록의 "전체" 건수를 읽는다. (목록 화면으로 이동한다) */
export async function orderTotalCount(page: Page): Promise<number> {
  await page.goto('/orders');
  const text = await page.locator('.filters a.chip').first().locator('.count').innerText();
  return parseInt(text.replace(/,/g, ''), 10);
}

/** 현재 마스터(기준값) 번호. 확정 요청에 함께 보내야 한다. */
export async function masterVersion(page: Page): Promise<number> {
  const res = await page.request.get('/api/master');
  expect(res.status()).toBe(200);
  return (await res.json()).version as number;
}

/**
 * 화면으로 주문 1건을 만든다: 시뮬레이션 실행 → 첫 번째 안(운항비 최소)으로 확정.
 * 확정되면 주문 상세로 이동하며, 주문 번호를 돌려준다. 상태는 "확정"이다.
 */
export async function createOrder(page: Page): Promise<number> {
  await page.goto('/orders/new');
  await page.locator('#runBtn').click();
  await expect(page.locator('#result')).toBeVisible();
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
 * 테스트가 만든 주문을 정리한다. 이 앱은 "취소"하면 주문을 지우므로 취소로 정리한다.
 * 이미 없거나 더 바꿀 수 없는 상태이면 조용히 넘어간다.
 */
export async function removeOrder(page: Page, id: number): Promise<void> {
  try {
    const version = await orderVersion(page, id);
    await page.request.post(`/orders/${id}/status`, {
      form: { status: 'CANCELED', version: String(version) },
      maxRedirects: 0,
    });
  } catch {
    /* 정리 실패는 테스트 결과에 영향을 주지 않는다 */
  }
}
