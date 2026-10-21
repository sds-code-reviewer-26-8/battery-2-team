import { test, expect } from '@playwright/test';

/**
 * No.       TC-E2E-001
 * 영역      로그인 / 접근 통제
 * 시나리오  로그인 → 주문 목록 → 로그아웃
 * 절차      1. 로그인 없이 홈(/) 접속
 *           2. 아이디 admin, 비밀번호 admin 입력 후 [로그인] 클릭
 *           3. 주문 목록 화면 확인
 *           4. [로그아웃] 클릭
 *           5. 로그아웃 상태로 /orders 재접속
 * 목적      로그인한 사용자만 화면을 쓸 수 있다는 기본 접근 통제가
 *           처음부터 끝까지 동작하는지 확인 (통합 PRD F1, INTENT G8)
 * 예상시간  10초
 * Pass 조건 1. /login 으로 이동, "배터리 주문 관리" 제목 표시
 *           3. URL /orders, "주문 목록" 제목, 메뉴 "주문 추가"·"마스터 데이터", 사용자명 admin
 *           4. /login 으로 복귀
 *           5. 다시 /login 으로 막힘
 * 담당자    (공란)
 * 전제      앱이 http://localhost:8080 에서 실행 중 (.\gradlew.bat bootRun)
 * 명세      src/test/e2e/TESTCASES.md
 */
test('TC-E2E-001 로그인 → 주문 목록 → 로그아웃', async ({ page }) => {
  // 절차 1 — 로그인 없이 홈 접속
  await page.goto('/');
  // Pass 1 — /login 으로 이동, 제목 표시
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '배터리 주문 관리' })).toBeVisible();

  // 절차 2 — admin / admin 입력 후 로그인
  await page.locator('input[name="username"]').fill('admin');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '로그인' }).click();

  // 절차 3 / Pass 3 — 주문 목록 화면 확인
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
  await expect(page.getByRole('link', { name: '주문 추가' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: '마스터 데이터' })).toBeVisible();
  await expect(page.locator('header .user')).toContainText('admin');

  // 절차 4 / Pass 4 — 로그아웃
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 절차 5 / Pass 5 — 로그아웃 상태로 보호된 화면 재접속
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/login$/);
});
