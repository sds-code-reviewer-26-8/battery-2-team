import { test, expect } from '@playwright/test';
import { ADMIN } from './helpers';

/**
 * No.       1
 * 영역      로그인
 * 시나리오  올바른 계정으로 로그인하면 주문 목록으로 이동
 * 절차      [사전 조건] 로그아웃 상태
 *           1. /login 접속
 *           2. 아이디 admin, 비밀번호 admin 입력
 *           3. 로그인 클릭
 * 목적      올바른 계정으로 로그인하면 업무 화면으로 진입하는지 확인
 * 예상시간  8초
 * Pass 조건 - /orders 로 이동
 *           - '주문 목록' 제목과 '주문 추가' 버튼 표시
 *           - 상단에 사용자명 'admin' 과 '로그아웃' 버튼 표시
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능)
 * 명세      docs/e2e/team/test-senarios.xlsx
 */
test('No.1 올바른 계정으로 로그인하면 주문 목록으로 이동', async ({ page }) => {
  // 사전 조건 — 새 브라우저 컨텍스트이므로 로그아웃 상태
  // 절차 1 — /login 접속
  await page.goto('/login');
  await expect(page.locator('input[name="username"]')).toBeVisible();

  // 절차 2 — 아이디 admin, 비밀번호 admin 입력
  await page.locator('input[name="username"]').fill(ADMIN.username);
  await page.locator('input[name="password"]').fill(ADMIN.password);

  // 절차 3 — 로그인 클릭
  await page.getByRole('button', { name: '로그인' }).click();

  // Pass 1 — /orders 로 이동 (주소 뒤에 ;jsessionid=… 가 붙을 수 있다)
  await expect(page).toHaveURL(/\/orders(;.*)?$/);

  // Pass 2 — '주문 목록' 제목과 '주문 추가' 버튼
  await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
  await expect(page.locator('.page-head a.button', { hasText: '주문 추가' })).toBeVisible();

  // Pass 3 — 상단에 사용자명 'admin' 과 '로그아웃' 버튼
  await expect(page.locator('header .user span')).toHaveText('admin');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
});
