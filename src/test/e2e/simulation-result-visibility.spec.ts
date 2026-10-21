import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { gaugeInput, openOrderForm, runSimulation, setNumber } from './ui-helpers';

/**
 * No.       12
 * 영역      주문 추가·시뮬레이션
 * 시나리오  시뮬레이션 전에는 확정 영역 숨김, 입력을 바꾸면 이전 결과 사라짐
 * 절차      [사전 조건] /orders/new 최초 진입
 *           1. 화면 확인
 *           2. '시뮬레이션 실행' 클릭
 *           3. 게이지 값 또는 총 생산 필요 수를 변경
 * 목적      시뮬레이션 전에는 확정 단계가 노출되지 않고, 입력이 바뀌면 이전 결과로 확정되지 않는지 확인
 * 예상시간  12초
 * Pass 조건 - 1: '시뮬레이션 실행' 버튼만 보이고 결과·'3. 주문 확정' 영역은 숨김
 *           - 3: 결과 영역(경로안·확정 영역)이 숨겨짐 → 변경된 입력으로 다시 실행해야 확정 가능
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능). 주문을 만들지 않는다.
 * 명세      docs/e2e/team/test-senarios.xlsx
 */
test('No.12 시뮬레이션 전 확정 영역 숨김, 입력을 바꾸면 이전 결과 사라짐', async ({ page }) => {
  await login(page);

  // 사전 조건 / 절차 1 / Pass 1 — 최초 진입: 실행 버튼만 보이고 결과·확정 영역은 숨김
  await openOrderForm(page);
  await expect(page.locator('#runBtn')).toBeVisible();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#confirmBtn')).toBeHidden();

  // 절차 2 — 시뮬레이션 실행: 결과와 확정 영역이 나타난다
  await runSimulation(page);
  await expect(page.locator('#options .option')).toHaveCount(3);
  await expect(page.locator('#confirmBtn')).toBeVisible();

  // 절차 3 / Pass 3 (게이지 값 변경) — 결과·확정 영역이 숨겨진다
  await setNumber(gaugeInput(page, 'CHINA'), 3500);
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#confirmBtn')).toBeHidden();

  // 변경된 입력으로 다시 실행하면 확정 영역이 다시 나타난다
  await runSimulation(page);
  await expect(page.locator('#confirmBtn')).toBeVisible();

  // 절차 3 / Pass 3 (총 생산 필요 수 변경) — 이번에도 결과·확정 영역이 숨겨진다
  await setNumber(page.locator('#total'), 9000);
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#confirmBtn')).toBeHidden();
});
