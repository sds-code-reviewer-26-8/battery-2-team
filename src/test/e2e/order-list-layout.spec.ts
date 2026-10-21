import { test, expect } from '@playwright/test';
import { createOrder, login, removeOrder } from './helpers';

/**
 * No.       20
 * 영역      주문 목록
 * 시나리오  목록 화면 구성과 이동(주문 추가, 행 클릭)
 * 절차      [사전 조건] 로그인 상태, 주문 1건 이상
 *           1. /orders 접속
 *           2. '주문 추가' 클릭
 *           3. 목록으로 돌아와 주문 행(번호 링크가 아닌 칸)을 클릭
 * 목적      목록 화면의 구성이 올바르고 새 주문·상세 화면으로 이동할 수 있는지 확인
 * 예상시간  15초
 * Pass 조건 - 제목 '주문 목록', '주문 추가' 버튼
 *           - 필터 칩: 전체 / 확정 / 진행 / 완료 / 취소 (각 건수 숫자 표시)
 *           - 표 헤더: 주문번호, 확정 일시, 총 수량(K), 경로, 소요 일수, 총 비용(억원), 상태, 작성자
 *           - 2: /orders/new 로 이동, '주문 추가' 제목 표시
 *           - 3: 해당 주문 상세(/orders/{id})로 이동
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능).
 *           사전 조건의 주문 1건은 테스트가 직접 만들고 끝에서 취소로 정리한다.
 * 명세      docs/e2e/team/test-senarios.xlsx
 */
test('No.20 목록 화면 구성과 이동(주문 추가, 행 클릭)', async ({ page }) => {
  await login(page);
  const id = await createOrder(page); // 사전 조건 — 주문 1건 이상

  try {
    // 절차 1 / Pass 1~3 — 목록 구성
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
    await expect(page.locator('.page-head a.button', { hasText: '주문 추가' })).toBeVisible();

    const chips = await page.locator('.filters a.chip').allInnerTexts();
    expect(chips.map(text => text.replace(/\s*[\d,]+\s*$/, '').trim())).toEqual(['전체', '확정', '진행', '완료', '취소']);
    for (const count of await page.locator('.filters a.chip .count').allInnerTexts()) {
      expect(count).toMatch(/^[\d,]+$/); // 각 칩에 건수 숫자 표시
    }

    expect(await page.locator('table.grid thead th').allInnerTexts()).toEqual([
      '주문번호', '확정 일시', '총 수량(K)', '경로', '소요 일수', '총 비용(억원)', '상태', '작성자',
    ]);

    // 절차 2 / Pass 4 — '주문 추가' → /orders/new, '주문 추가' 제목
    await page.locator('.page-head a.button', { hasText: '주문 추가' }).click();
    await expect(page).toHaveURL(/\/orders\/new$/);
    await expect(page.getByRole('heading', { name: '주문 추가' })).toBeVisible();

    // 절차 3 / Pass 5 — 목록으로 돌아와 번호 링크가 아닌 칸을 누르면 해당 주문 상세로 이동
    await page.goto('/orders');
    const row = page.locator('table.grid tbody tr.clickable', { hasText: `#${id}` });
    await row.locator('td').nth(1).click(); // 확정 일시 칸 (번호 링크가 아님)
    await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
  } finally {
    await removeOrder(page, id);
  }
});
