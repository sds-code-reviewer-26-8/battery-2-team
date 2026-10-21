import { test, expect } from '@playwright/test';
import { login, orderTotalCount, removeOrder } from './helpers';
import { runSimulation } from './ui-helpers';

/**
 * No.       18
 * 영역      주문 확정
 * 시나리오  시뮬레이션 뒤 기준값이 바뀌면 확정 거절
 * 절차      [사전 조건] 기본 기준값, 같은 로그인 세션의 탭 2개, 주문 건수 기록
 *           1. 탭 A: 주문 추가에서 시뮬레이션 실행(확정하지 않음)
 *           2. 탭 B: 기준값 화면에서 값을 바꾸지 않고 그대로 저장(기준값 번호만 올라감)
 *           3. 탭 A: '주문 확정' 클릭
 *           4. 주문 목록 건수 확인
 * 목적      결과를 본 뒤 기준값이 바뀐 경우 오래된 결과로 주문이 확정되지 않는지 확인 (데이터 정합성)
 * 예상시간  16초
 * Pass 조건 - 3: '시뮬레이션 이후 마스터 데이터가 바뀌었습니다. 다시 시뮬레이션해 주세요' 표시, 주문 상세로 이동하지 않음
 *           - 4: 주문 건수가 늘지 않음
 *           - 다시 시뮬레이션한 뒤에는 확정 성공
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능).
 *           기준값은 그대로 저장하므로 값은 바뀌지 않는다. 마지막에 만든 주문 1건은 취소로 정리한다.
 * 명세      docs/e2e/team/test-senarios.xlsx
 */
test('No.18 시뮬레이션 뒤 기준값이 바뀌면 확정 거절', async ({ page, context }) => {
  await login(page);
  const before = await orderTotalCount(page); // 사전 조건 — 주문 건수 기록
  let createdId: number | undefined;

  try {
    // 절차 1 — 탭 A: 시뮬레이션 실행(확정하지 않음)
    await page.goto('/orders/new');
    await runSimulation(page);

    // 절차 2 — 탭 B: 기준값 화면에서 값을 바꾸지 않고 그대로 저장
    const tabB = await context.newPage();
    await tabB.goto('/master');
    await tabB.getByRole('button', { name: '저장' }).click();
    await expect(tabB.locator('.alert.ok')).toHaveText('마스터 데이터를 저장했습니다');

    // 절차 3 / Pass 3 — 탭 A: 확정 거절 메시지, 주문 상세로 이동하지 않음
    await page.locator('#confirmBtn').click();
    await expect(page.locator('#confirmError')).toBeVisible();
    await expect(page.locator('#confirmError')).toContainText(
      '시뮬레이션 이후 마스터 데이터가 바뀌었습니다. 다시 시뮬레이션해 주세요',
    );
    await expect(page).toHaveURL(/\/orders\/new$/);

    // 절차 4 / Pass 4 — 주문 건수가 늘지 않음
    expect(await orderTotalCount(tabB)).toBe(before);

    // Pass — 다시 시뮬레이션한 뒤에는 확정 성공
    await runSimulation(page);
    await page.locator('#confirmBtn').click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    createdId = Number(new URL(page.url()).pathname.split('/').pop());
    await tabB.close();
  } finally {
    if (createdId !== undefined) await removeOrder(page, createdId); // 만든 주문 정리
  }
});
