import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * No.       28
 * 영역      마스터 데이터
 * 시나리오  기본 기준값 표시
 * 절차      [사전 조건] 앱 최초 기동 상태의 기본 기준값
 *           1. /master 접속
 * 목적      기본 기준 정보가 올바르게 표시되는지 확인
 * 예상시간  10초
 * Pass 조건 - 공장 4곳의 하루 최대 생산량·재고 상한·셀당 원가가 기본값으로 표시
 *             (중국 400/4,000/700, 일본 800/2,000/900, 베트남 200/10,000/550, 인도네시아 300/7,000/450)
 *           - 배 척수 3, 척당 일 운항비 1
 *           - 항로 표에 기본 항해 일수 (한국–중국 1일 등)
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능).
 *           기준값이 이미 바뀐 DB 에서는 실패한다. 값을 바꾸는 다른 시나리오는 끝에서 원래 값으로 되돌린다.
 *           주문을 만들지 않고 값을 바꾸지도 않는다(읽기만 한다).
 * 명세      docs/e2e/team/test-senarios.xlsx
 */

/** 공장별 [하루 최대 생산량(K), 재고 상한(K), 셀당 원가(원)] 기본값 */
const FACTORY_DEFAULTS: Record<string, [number, number, number]> = {
  CHINA: [400, 4000, 700],
  JAPAN: [800, 2000, 900],
  VIETNAM: [200, 10000, 550],
  INDONESIA: [300, 7000, 450],
};

/** 나라 사이 기본 항해 일수 (입력칸 이름 days_{from}_{to}) */
const ROUTE_DEFAULTS: Record<string, number> = {
  days_KOREA_CHINA: 1,
  days_KOREA_JAPAN: 2,
  days_KOREA_VIETNAM: 5,
  days_KOREA_INDONESIA: 7,
  days_CHINA_JAPAN: 2,
  days_CHINA_VIETNAM: 4,
  days_CHINA_INDONESIA: 6,
  days_JAPAN_VIETNAM: 5,
  days_JAPAN_INDONESIA: 7,
  days_VIETNAM_INDONESIA: 2,
};

test('No.28 기본 기준값 표시', async ({ page }) => {
  await login(page);

  // 절차 1 — /master 접속
  await page.goto('/master');
  const field = (name: string) => page.locator(`input[name="${name}"]`);

  // Pass 1 — 공장 4곳의 하루 최대 생산량·재고 상한·셀당 원가
  for (const [country, [maxDaily, stockLimit, unitCost]] of Object.entries(FACTORY_DEFAULTS)) {
    await expect(field(`maxDaily_${country}`), `${country} 하루 최대 생산량`).toHaveValue(String(maxDaily));
    await expect(field(`stockLimit_${country}`), `${country} 재고 상한`).toHaveValue(String(stockLimit));
    await expect(field(`unitCost_${country}`), `${country} 셀당 원가`).toHaveValue(String(unitCost));
  }

  // Pass 2 — 배 척수 3, 척당 일 운항비 1
  await expect(field('shipCount')).toHaveValue('3');
  await expect(field('shipDailyCost')).toHaveValue('1');

  // Pass 3 — 항로 표의 기본 항해 일수 (한국–중국 1일 등)
  for (const [name, days] of Object.entries(ROUTE_DEFAULTS)) {
    await expect(field(name), name).toHaveValue(String(days));
  }
});
