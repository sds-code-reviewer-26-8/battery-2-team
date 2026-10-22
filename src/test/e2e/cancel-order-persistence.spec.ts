import { test, expect } from '@playwright/test';
import { chipCount, createOrder, login } from './helpers';
import { changeStatus } from './ui-helpers';

/**
 * 추가 재현 시나리오 (PR #28 '취소한 주문을 삭제하지 않고 취소 상태로 남김' 리뷰)
 *
 * R1  취소한 주문을 다시 열어도 '취소' 상태와 이력·저장된 계획이 유지됨
 * R2  취소하면 목록의 '확정' 건수는 줄고 '취소' 건수는 늘며 '전체'는 그대로, 취소 필터에 그 주문이 나타남
 *
 * 왜 필요한가: 기존 T26 은 취소한 바로 그 화면의 배지와 목록의 '취소' 칩 +2 만 확인한다.
 *   PR #28 의 핵심 변화인 "취소한 주문을 다시 열 수 있다"(수정 전에는 오류 화면)와
 *   "전체 건수가 취소 전후로 그대로다"(팀 결정 전 현재 동작)는 E2E 로 고정되어 있지 않았다.
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능).
 *           취소는 최종 상태라 만든 주문을 지울 수 없다. 실행할 때마다 '취소' 주문이 시나리오마다 1건씩 DB 에 남는다.
 * 명세      PR #28 코멘트 (docs/PRD-INTENT/team/PRD.md §10-1, INTENT.md §7-1 의 취소 결정)
 */
test.describe('취소한 주문은 삭제되지 않고 남는다', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('R1 취소한 주문을 다시 열어도 취소 상태와 이력·저장된 계획이 유지됨', async ({ page }) => {
    const id = await createOrder(page); // 확정 주문. 상세 화면에 머문다
    const badge = page.locator('#title .badge');

    await changeStatus(page, '취소');
    await expect(badge).toHaveText('취소'); // 취소 직후

    // 다른 화면을 거쳐 다시 열기 (수정 전에는 주문이 삭제되어 열 수 없었다)
    await page.goto('/orders');
    await page.goto(`/orders/${id}`);
    await expect(badge).toHaveText('취소');
    await expect(page.getByText('최종 상태라 더 바꿀 수 없습니다.')).toBeVisible();
    await expect(page.locator('#actions button')).toHaveCount(0);

    // 상태 이력: 확정 → 취소 2건
    const history = page.locator('#history tr');
    await expect(history).toHaveCount(2);
    await expect(history.nth(0).locator('td').nth(2)).toHaveText('확정');
    await expect(history.nth(1).locator('td').nth(1)).toHaveText('확정');
    await expect(history.nth(1).locator('td').nth(2)).toHaveText('취소');

    // 확정 때 저장된 계획은 취소 후에도 그대로 보인다
    await expect(page.locator('#summary')).toContainText('요약');
    await expect(page.locator('#details')).toContainText('나라별 주문 수량');

    // API 도 같은 사실을 말한다: 200, 상태 CANCELED, 더 바꿀 수 있는 상태 없음
    const res = await page.request.get(`/api/orders/${id}`);
    expect(res.status()).toBe(200);
    const order = await res.json();
    expect(order.status.name).toBe('CANCELED');
    expect(order.nextStatuses).toEqual([]);

    // 직접 요청으로 다시 취소하려 해도 거절된다 (최종 상태)
    const again = await page.request.post(`/api/orders/${id}/status`, {
      data: { status: 'CANCELED', version: order.version },
    });
    expect(again.status()).toBe(400);
    expect((await again.json()).error).toContain('취소 상태에서는');
  });

  test('R2 취소하면 확정 건수는 줄고 취소 건수는 늘며 전체는 그대로, 취소 필터에 나타남', async ({ page }) => {
    await page.goto('/orders');
    const before = {
      all: await chipCount(page, '전체'),
      confirmed: await chipCount(page, '확정'),
      canceled: await chipCount(page, '취소'),
    };

    const id = await createOrder(page); // 확정 주문 1건 생성 (상세 화면에 머문다)
    await page.goto('/orders');
    expect(await chipCount(page, '전체'), '생성 후 전체').toBe(before.all + 1);
    expect(await chipCount(page, '확정'), '생성 후 확정').toBe(before.confirmed + 1);

    await page.goto(`/orders/${id}`);
    await changeStatus(page, '취소');
    await expect(page.locator('#title .badge')).toHaveText('취소');

    // 취소 후: 전체는 그대로(취소 주문도 목록에 남는다), 확정은 원래대로, 취소는 +1
    await page.goto('/orders');
    expect(await chipCount(page, '전체'), '취소 후 전체(변하지 않아야 함)').toBe(before.all + 1);
    expect(await chipCount(page, '확정'), '취소 후 확정').toBe(before.confirmed);
    expect(await chipCount(page, '취소'), '취소 후 취소').toBe(before.canceled + 1);

    // '취소' 필터: 그 주문이 '취소' 배지로 나오고, 행 수는 칩 건수와 같다
    await page.locator('#filters a.chip', { hasText: '취소' }).click();
    await expect(page).toHaveURL(/status=CANCELED$/);
    const row = page.locator('#rows tr.clickable', { hasText: `#${id}` });
    await expect(row.locator('.badge')).toHaveText('취소');
    await expect(page.locator('#rows tr.clickable')).toHaveCount(before.canceled + 1);
  });
});
