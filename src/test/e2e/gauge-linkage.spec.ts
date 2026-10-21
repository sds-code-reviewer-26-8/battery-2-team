import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { gaugeInput, gaugeValues, openOrderForm, setNumber } from './ui-helpers';

/**
 * No.       8
 * 영역      주문 추가·시뮬레이션
 * 시나리오  수량 게이지 연동: 오른쪽 나라가 반대로 조정
 * 절차      [사전 조건] 기본값 12,000K (각 3,000K)
 *           1. 중국 수량 입력칸에 4000 입력
 *           2. 인도네시아 수량 입력칸에 1000 입력
 * 목적      한 나라의 수량을 바꾸면 인접한 나라가 반대로 조정되고 합계가 유지되는지 확인
 * 예상시간  12초
 * Pass 조건 - 1: 중국 4,000K, 일본 2,000K (오른쪽 나라가 반대로 조정), 베트남·인도네시아는 3,000K 그대로, 합계 12,000K 유지
 *           - 2: 인도네시아 1,000K, 중국이 조정 (맨 오른쪽은 맨 왼쪽이 조정), 합계 12,000K 유지
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능). 주문을 만들지 않는다.
 * 명세      docs/e2e/team/test-senarios.xlsx
 */
test('No.8 수량 게이지 연동: 오른쪽 나라가 반대로 조정', async ({ page }) => {
  await login(page);
  await openOrderForm(page);

  // 사전 조건 — 기본값 12,000K (각 3,000K)
  await expect(page.locator('#total')).toHaveValue('12000');
  expect(await gaugeValues(page)).toEqual([3000, 3000, 3000, 3000]);

  // 절차 1 / Pass 1 — 중국 4000: 일본이 반대로 2000, 나머지 그대로, 합계 12,000
  await setNumber(gaugeInput(page, 'CHINA'), 4000);
  expect(await gaugeValues(page)).toEqual([4000, 2000, 3000, 3000]);
  expect((await gaugeValues(page)).reduce((a, b) => a + b, 0)).toBe(12000);

  // 절차 2 / Pass 2 — 인도네시아 1000: 맨 오른쪽이라 맨 왼쪽(중국)이 반대로 조정.
  //   (인도네시아 3,000 → 1,000 : 중국 4,000 → 6,000), 합계 12,000 유지
  await setNumber(gaugeInput(page, 'INDONESIA'), 1000);
  const after = await gaugeValues(page);
  expect(after).toEqual([6000, 2000, 3000, 1000]);
  expect(after.reduce((a, b) => a + b, 0)).toBe(12000);
});
