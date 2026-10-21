import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * No.       5
 * 영역      공통 화면
 * 시나리오  상단 메뉴로 화면 이동과 현재 메뉴 강조
 * 절차      [사전 조건] 로그인 상태
 *           1. '주문 추가' 클릭
 *           2. '마스터 데이터' 클릭
 *           3. '주문 목록' 클릭
 *           4. 로고('배터리 주문 관리') 클릭
 * 목적      상단 메뉴로 주요 화면을 오갈 수 있고 현재 위치가 표시되는지 확인
 * 예상시간  15초
 * Pass 조건 - 각각 /orders/new, /master, /orders, /orders 로 이동
 *           - 현재 화면의 메뉴가 강조(active) 표시
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능)
 * 명세      docs/e2e/team/test-senarios.xlsx
 */
test('No.5 상단 메뉴로 화면 이동과 현재 메뉴 강조', async ({ page }) => {
  await login(page); // 사전 조건 — 로그인 상태
  const menu = (name: string) => page.locator('header nav a', { hasText: name });

  // 절차 1 / Pass — '주문 추가' → /orders/new, 해당 메뉴 강조
  await menu('주문 추가').click();
  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(menu('주문 추가')).toHaveClass(/active/);
  await expect(menu('주문 목록')).not.toHaveClass(/active/);

  // 절차 2 / Pass — '마스터 데이터' → /master, 해당 메뉴 강조
  await menu('마스터 데이터').click();
  await expect(page).toHaveURL(/\/master$/);
  await expect(menu('마스터 데이터')).toHaveClass(/active/);
  await expect(menu('주문 추가')).not.toHaveClass(/active/);

  // 절차 3 / Pass — '주문 목록' → /orders, 해당 메뉴 강조
  await menu('주문 목록').click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(menu('주문 목록')).toHaveClass(/active/);

  // 절차 4 / Pass — 다른 화면에서 로고를 누르면 /orders 로 이동
  await page.goto('/master');
  await page.locator('header .brand').click();
  await expect(page).toHaveURL(/\/orders$/);
});
