import { test, expect } from '@playwright/test';
import { cancelOrderIfOpen, login, orderRow } from './helpers';
import { readMasterForm, runSimulation, saveMasterForm } from './ui-helpers';

/**
 * No.       TASK-002
 * 영역      마스터 데이터 / 주문
 * 시나리오  공장 운영비 설정과 시뮬레이션·주문 반영
 * 절차      [사전 조건] 기본 기준값 (공장별 하루 운영비 10억)
 *           1. /master 에서 중국 하루 운영비에 숫자가 아닌 값을 넣고 저장 → 이유와 함께 거부되는지 확인
 *           2. 기본값으로 시뮬레이션 → 요약에 운영비 행이 있고 총 비용 = 생산 원가 + 운항비 + 운영비
 *           3. 선택한 안으로 주문 확정 → 상세 요약·주문 목록의 운영비가 시뮬레이션과 같은지 확인
 *           4. 모든 공장 운영비를 0 으로 저장 후 다시 시뮬레이션 → 운영비 0.00억원
 *           5. 기준값을 원래대로 되돌려 저장
 * 목적      공장 운영비가 입력·계산·저장·표시에서 같은 숫자로 쓰이는지 확인
 * 예상시간  30초
 * Pass 조건 - 잘못된 운영비는 저장되지 않고 오류 이유가 표시됨
 *           - 요약의 운영비 행과 합계가 일치하고, 주문 상세·목록에도 같은 운영비가 표시됨
 *           - 운영비 0 으로 저장하면 시뮬레이션 운영비가 0.00억원
 *           - 5 이후 원래 값으로 복원
 * 담당자    kewrybyun0119
 * 전제      앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능).
 *           기준값을 바꾸므로 같은 DB 를 쓰는 다른 테스트와 동시에 실행하지 않는다(workers: 1).
 *           테스트가 끝나면 기준값을 원래대로 되돌리고, 만든 주문 1건은 취소로 정리한다.
 * 명세      docs/e2e/team/test-senarios.xlsx
 */

const FACTORY_KEYS = ['CHINA', 'JAPAN', 'VIETNAM', 'INDONESIA'].map(c => `operatingCost_${c}`);

/** 요약 카드에서 라벨에 해당하는 금액(억원)을 읽는다. */
async function summaryEok(page: import('@playwright/test').Page, label: string): Promise<number> {
  const text = await page
    .locator('#summary .stats div', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) })
    .locator('b')
    .innerText();
  return Number(text.replace('억원', ''));
}

test('TASK-002 공장 운영비 설정과 시뮬레이션·주문 반영', async ({ page }) => {
  await login(page);
  const original = await readMasterForm(page); // 사전 조건 — 현재 기준값을 기억해 둔다
  let id: number | undefined;

  try {
    // 절차 1 / Pass 1 — 잘못된 운영비는 이유와 함께 거부된다
    await page.goto('/master');
    const china = page.locator('input[name="operatingCost_CHINA"]');
    await expect(china).toHaveValue('10');
    await china.fill('열억');
    await page.getByRole('button', { name: /저장/ }).click();
    await expect(page.locator('#alerts .alert.error')).toContainText('중국 하루 운영비');
    expect((await readMasterForm(page)).operatingCost_CHINA).toBe('10'); // 저장되지 않음

    // 절차 2 / Pass 2 — 시뮬레이션 요약에 운영비 행, 총 비용은 세 항목의 합
    await page.goto('/orders/new');
    await runSimulation(page);
    const production = await summaryEok(page, '생산 원가');
    const shipping = await summaryEok(page, '운항비');
    const operating = await summaryEok(page, '운영비');
    const total = await summaryEok(page, '총 비용');
    expect(operating).toBeGreaterThan(0);
    expect(Math.abs(production + shipping + operating - total)).toBeLessThan(0.02);

    // 절차 3 / Pass 2 — 확정한 주문의 상세·목록 운영비가 시뮬레이션과 같다
    await page.locator('#confirmBtn').click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    id = Number(new URL(page.url()).pathname.split('/').pop());
    expect(await summaryEok(page, '운영비')).toBe(operating);
    await page.goto('/orders');
    const cells = await orderRow(page, id).locator('td').allInnerTexts();
    expect(Number(cells[5])).toBe(operating);

    // 절차 4 / Pass 3 — 운영비를 모두 0 으로 저장하면 시뮬레이션 운영비도 0
    const zero = { ...original };
    FACTORY_KEYS.forEach(k => (zero[k] = '0'));
    await saveMasterForm(page, zero);
    await page.goto('/orders/new');
    await runSimulation(page);
    expect(await summaryEok(page, '운영비')).toBe(0);
  } finally {
    // 절차 5 / Pass 4 — 기준값을 원래대로 되돌리고, 만든 주문을 정리
    await saveMasterForm(page, original);
    if (id !== undefined) await cancelOrderIfOpen(page, id);
  }

  expect(await readMasterForm(page)).toEqual(original);
});
