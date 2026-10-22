import { test, expect } from '@playwright/test';
import { createOrder, login, cancelOrderIfOpen } from './helpers';
import { readMasterForm, runSimulation, saveMasterForm } from './ui-helpers';

/**
 * No.       35
 * 영역      마스터 데이터
 * 시나리오  기준값 변경은 이미 확정된 주문의 계획을 바꾸지 않음
 * 절차      [사전 조건] 기본 기준값
 *           1. 주문 1건 확정 (소요일·총 비용 기록)
 *           2. 기준값에서 배 척수·운항비·원가 변경 후 저장
 *           3. 해당 주문 상세 다시 열기
 *           4. 기준값을 원래대로 되돌려 저장
 * 목적      기준 정보 변경이 이미 확정된 주문에 영향을 주지 않는지 확인 (확정 주문 보존)
 * 예상시간  20초
 * Pass 조건 - 상세의 소요일·총 비용·경로가 변경 전과 동일
 *           - 새 시뮬레이션은 변경된 값으로 계산됨
 *           - 4 이후 원래 값으로 복원
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능).
 *           기준값을 바꾸므로 같은 DB 를 쓰는 다른 테스트와 동시에 실행하지 않는다(workers: 1).
 *           테스트가 끝나면 기준값을 원래대로 되돌리고, 만든 주문 1건은 취소로 정리한다.
 * 명세      docs/e2e/team/test-senarios.xlsx
 */
test('No.35 기준값 변경은 이미 확정된 주문의 계획을 바꾸지 않음', async ({ page }) => {
  await login(page);
  const original = await readMasterForm(page); // 사전 조건 — 현재(기본) 기준값을 기억해 둔다
  let id: number | undefined;

  /** 상세 화면의 요약(총 수량·소요 일수·생산 원가·운항비·총 비용)과 경로 */
  const snapshot = async () => ({
    route: await page.locator('dl.meta > div', { hasText: '경로' }).locator('dd').innerText(),
    summary: (await page.locator('#summary .stats').innerText()).replace(/\s+/g, ' '),
  });

  try {
    // 절차 1 — 주문 1건 확정, 소요일·총 비용 기록
    id = await createOrder(page);
    const before = await snapshot();
    expect(before.summary).toMatch(/소요 일수 \d+일/);
    expect(before.summary).toMatch(/총 비용 [\d.]+억원/);

    // 절차 2 — 배 척수·운항비·원가 변경 후 저장
    await saveMasterForm(page, {
      ...original,
      shipCount: '1',
      shipDailyCost: '2',
      unitCost_CHINA: String(Number(original.unitCost_CHINA) * 2),
    });
    await page.goto('/master');
    await expect(page.locator('input[name="shipCount"]')).toHaveValue('1'); // 실제로 저장됨

    // 절차 3 / Pass 1 — 상세를 다시 열면 소요일·총 비용·경로가 변경 전과 같다
    await page.goto(`/orders/${id}`);
    const after = await snapshot();
    expect(after).toEqual(before);

    // Pass 2 — 새 시뮬레이션은 변경된 값으로 계산된다 (배 1척, 총 비용 증가)
    await page.goto('/orders/new');
    await runSimulation(page);
    const cost = await page.locator('#options .option', { hasText: '총 비용 최소' }).innerText();
    expect(cost).toContain('배 1척');
    const oldCost = Number(before.summary.match(/총 비용 ([\d.]+)억원/)![1]);
    const newCost = Number(cost.match(/총 비용 ([\d.]+)억원/)![1]);
    expect(newCost).toBeGreaterThan(oldCost);
  } finally {
    // 절차 4 / Pass 3 — 기준값을 원래대로 되돌려 저장하고, 만든 주문을 정리
    await saveMasterForm(page, original);
    if (id !== undefined) await cancelOrderIfOpen(page, id);
  }

  expect(await readMasterForm(page)).toEqual(original); // 원래 값으로 복원되었는지 확인
});
