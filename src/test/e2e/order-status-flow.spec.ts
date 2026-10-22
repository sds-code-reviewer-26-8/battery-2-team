import { test, expect } from '@playwright/test';
import { chipCount, login, orderRow } from './helpers';
import { changeStatus, runSimulation } from './ui-helpers';

/**
 * No.       22
 * 영역      주문 상태
 * 시나리오  핵심 업무 흐름: 확정 → 진행 → 완료, 완료는 최종 상태
 * 절차      [사전 조건] 로그인 상태, 완료 건수 기록
 *           1. 기본값(12,000K)으로 시뮬레이션 실행
 *           2. '운항비 최소' 선택, 메모 입력 후 주문 확정
 *           3. 상세에서 '진행(으)로 변경' → 확인창 수락
 *           4. '완료(으)로 변경' → 확인창 수락
 *           5. 주문 목록으로 이동
 * 목적      핵심 업무 흐름이 처음부터 끝까지 끊김 없이 동작하고 완료가 최종 상태로 잠기는지 확인 (주문 1건 생성)
 * 예상시간  20초
 * Pass 조건 - 확정 후 상세 화면(/orders/{id})으로 이동, 상태 '확정'
 *           - 3: "상태를 '진행'(으)로 바꿨습니다" 메시지, 배지 '진행', 변경 버튼은 '완료(으)로 변경'·'취소(으)로 변경'
 *           - 4: 배지 '완료', 변경 버튼 없음, '최종 상태라 더 바꿀 수 없습니다.' 표시
 *           - 상태 이력 3건 (확정·진행·완료)
 *           - 5: 목록의 '완료' 칩 건수가 1 증가, 해당 주문 상태 '완료'
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능).
 *           완료는 최종 상태라 만든 주문을 지울 수 없다. 실행할 때마다 완료 주문 1건이 DB 에 남는다.
 * 명세      docs/e2e/team/test-senarios.xlsx
 */
test('No.22 핵심 업무 흐름: 확정 → 진행 → 완료, 완료는 최종 상태', async ({ page }) => {
  await login(page);
  const badge = page.locator('h1 .badge');
  const historyRows = page
    .locator('section.card', { has: page.getByRole('heading', { name: '상태 이력' }) })
    .locator('tbody tr');

  // 사전 조건 — 완료 건수 기록
  await page.goto('/orders');
  const doneBefore = await chipCount(page, '완료');

  // 절차 1 — 기본값(12,000K)으로 시뮬레이션 실행
  await page.goto('/orders/new');
  await expect(page.locator('#total')).toHaveValue('12000');
  await runSimulation(page);

  // 절차 2 — '운항비 최소' 선택, 메모 입력 후 주문 확정
  await page.locator('#options .option', { hasText: '운항비 최소' }).click();
  await page.locator('#memo').fill('No.22 핵심 업무 흐름 테스트');
  await page.locator('#confirmBtn').click();

  // Pass — 확정 후 상세 화면(/orders/{id}), 상태 '확정'
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  const id = Number(new URL(page.url()).pathname.split('/').pop());
  await expect(badge).toHaveText('확정');

  // 절차 3 / Pass 3 — '진행(으)로 변경' → 메시지, 배지 '진행', 변경 버튼 2개
  await changeStatus(page, '진행');
  await expect(page.locator('.alert.ok')).toHaveText("상태를 '진행'(으)로 바꿨습니다");
  await expect(badge).toHaveText('진행');
  await expect(page.getByRole('button', { name: '완료(으)로 변경' })).toBeVisible();
  await expect(page.getByRole('button', { name: '취소(으)로 변경' })).toBeVisible();
  await expect(page.getByRole('button', { name: '진행(으)로 변경' })).toHaveCount(0);

  // 절차 4 / Pass 4 — '완료(으)로 변경' → 배지 '완료', 변경 버튼 없음, 최종 상태 안내
  await changeStatus(page, '완료');
  await expect(badge).toHaveText('완료');
  await expect(page.locator('.actions button')).toHaveCount(0);
  await expect(page.getByText('최종 상태라 더 바꿀 수 없습니다.')).toBeVisible();

  // Pass — 상태 이력 3건 (확정·진행·완료)
  await expect(historyRows).toHaveCount(3);
  await expect(historyRows.nth(0).locator('td').nth(2)).toHaveText('확정');
  await expect(historyRows.nth(1).locator('td').nth(2)).toHaveText('진행');
  await expect(historyRows.nth(2).locator('td').nth(2)).toHaveText('완료');

  // 절차 5 / Pass 5 — 목록의 '완료' 칩 건수 +1, 해당 주문 상태 '완료'
  await page.goto('/orders');
  expect(await chipCount(page, '완료')).toBe(doneBefore + 1);
  await expect(orderRow(page, id).locator('.badge')).toHaveText('완료');
});
