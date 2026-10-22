import { test, expect, type Page } from '@playwright/test';
import { chipCount, createOrder, login, orderTotalCount, cancelOrderIfOpen } from './helpers';

/**
 * 담당자: sy9169park — 팀 통합 시나리오 (docs/e2e/team/test-senarios.xlsx) 중 배정된 9개
 *   2, 7, 11, 14, 16, 23, 25, 30, 31
 *
 * - 테스트 제목의 [T번호] 는 통합 시나리오의 No. 와 같다.
 * - 이미 실행 중인 서버(playwright.config.ts 의 baseURL)를 대상으로 하며, 시나리오당 20초 이내(표의 기준)에 끝나야 한다.
 * - 주문을 만드는 시나리오(16, 23, 25)는 끝나면 취소로 정리한다(주문은 삭제되지 않고 '취소' 상태로 남는다).
 * - 기준값을 바꾸는 시나리오(31)는 끝에서 원래 값으로 되돌린다. 30은 저장되지 않는 것이 Pass 조건이다.
 */
test.describe.configure({ timeout: 20_000 });

/** 주문 상세/목록 화면의 "상태 이력" 표 행 */
const historyRows = (page: Page) =>
  page.locator('section.card', { has: page.getByRole('heading', { name: '상태 이력' }) }).locator('tbody tr');

test.describe('sy9169park 담당 시나리오', () => {
  test('[T02] 로그인: 잘못된 계정 정보로 로그인 실패', async ({ page }) => {
    const attempts = [
      { username: 'admin', password: 'wrong-password' }, // 1. 틀린 비밀번호
      { username: 'wrong-user', password: 'admin' }, //     2. 틀린 아이디
    ];
    for (const { username, password } of attempts) {
      await page.goto('/login');
      await page.locator('input[name="username"]').fill(username);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole('button', { name: '로그인' }).click();

      // 로그인 화면 유지 (주소에 ;jsessionid=… 가 붙는 것은 허용), 이유 안내, 주문 목록으로 가지 않음
      await expect(page).toHaveURL(/\/login(;.*)?$/);
      await expect(page.locator('.alert.error')).toContainText('아이디 또는 비밀번호가 올바르지 않습니다');
      await expect(page).not.toHaveURL(/\/orders/);
    }
  });

  test('[T07] 주문 추가: 총 생산 필요 수 변경 시 4개국 균등 분배, 잘못된 값은 이전 값으로 복구', async ({ page }) => {
    await login(page);
    await page.goto('/orders/new');
    const total = page.locator('#total');
    const gauge = (country: string) => page.locator(`#gauges .gauge[data-c="${country}"] .gnum`);
    const countries = ['CHINA', 'JAPAN', 'VIETNAM', 'INDONESIA'];
    const sumOfGauges = async () => {
      let sum = 0;
      for (const c of countries) sum += Number(await gauge(c).inputValue());
      return sum;
    };

    // 1. 10000 → 각 2,500K
    await total.fill('10000');
    await total.press('Tab'); // change 이벤트
    for (const c of countries) await expect(gauge(c)).toHaveValue('2500');
    expect(await sumOfGauges()).toBe(10000);

    // 2. 10001 → 중국 2,501K, 나머지 2,500K (나머지는 앞 나라부터 1씩 배분)
    await total.fill('10001');
    await total.press('Tab');
    await expect(gauge('CHINA')).toHaveValue('2501');
    for (const c of ['JAPAN', 'VIETNAM', 'INDONESIA']) await expect(gauge(c)).toHaveValue('2500');
    expect(await sumOfGauges()).toBe(10001);

    // 3, 4. 0 이나 빈 값은 입력칸이 직전 값으로 되돌아가고 게이지 값은 변하지 않는다
    for (const bad of ['0', '']) {
      await total.fill(bad);
      await total.press('Tab');
      await expect(total).toHaveValue('10001');
      await expect(gauge('CHINA')).toHaveValue('2501');
      expect(await sumOfGauges()).toBe(10001);
    }
  });

  test('[T11] 주문 추가: 경로안 선택 전환 시 화면 갱신', async ({ page }) => {
    await login(page);
    await page.goto('/orders/new');
    await page.locator('#runBtn').click();
    await expect(page.locator('#result')).toBeVisible();

    const option = (type: string) => page.locator(`#options .option[data-type="${type}"]`);
    // 처음에는 "운항비 최소"가 선택되어 있다
    await expect(option('COST')).toHaveClass(/selected/);

    // 1. '가장 빠르게' 클릭 → 그 안만 선택, 요약과 상세가 그 안으로 갱신
    await option('FAST').click();
    await expect(option('FAST')).toHaveClass(/selected/);
    await expect(option('COST')).not.toHaveClass(/selected/);
    await expect(option('NEAR')).not.toHaveClass(/selected/);
    await expect(page.locator('#summary')).toContainText('가장 빠르게');
    await expect(page.locator('#details')).toBeVisible();
    await expect(page.locator('#anim .anim')).toBeVisible();

    // 2. '가까운 곳부터' 클릭
    await option('NEAR').click();
    await expect(option('NEAR')).toHaveClass(/selected/);
    await expect(option('FAST')).not.toHaveClass(/selected/);
    await expect(page.locator('#summary')).toContainText('가까운 곳부터');
    await expect(page.locator('#anim .anim')).toBeVisible();
  });

  test('[T14] 입력 검증: 수량 0, 음수 요청 거절', async ({ page }) => {
    await login(page);

    // 1. 4개 나라 수량을 모두 0으로
    const zero = await page.request.post('/api/simulate', {
      data: { orders: { CHINA: 0, JAPAN: 0, VIETNAM: 0, INDONESIA: 0 } },
    });
    expect(zero.status()).toBe(400);
    const zeroBody = await zero.json();
    expect(zeroBody.error).toBe('총 생산 필요 수는 1K 이상이어야 합니다');
    expect(zeroBody.options).toBeUndefined(); // 3가지 안이 반환되지 않는다

    // 2. 중국 -5, 일본 100
    const negative = await page.request.post('/api/simulate', { data: { orders: { CHINA: -5, JAPAN: 100 } } });
    expect(negative.status()).toBe(400);
    const negativeBody = await negative.json();
    expect(negativeBody.error).toBe('중국 주문 수량은 0 이상이어야 합니다');
    expect(negativeBody.options).toBeUndefined();
  });

  test('[T16] 주문 확정: 메모 없이 확정하면 목록 최상단에 반영', async ({ page }) => {
    await login(page);
    await orderTotalCount(page); // 목록 화면으로 이동
    const totalBefore = await chipCount(page, '전체');
    const confirmedBefore = await chipCount(page, '확정');

    // 1. 메모를 비워 둔 채 확정
    const id = await createOrder(page);
    try {
      // 상세 메모 칸에 '-' 표시
      const memo = page.locator('dl.meta div', { has: page.locator('dt', { hasText: '메모' }) }).locator('dd');
      await expect(memo).toHaveText('-');

      // 2. 주문 목록: 최상단에 방금 확정한 주문(번호 내림차순)과 각 항목
      await page.goto('/orders');
      const top = page.locator('table.grid tbody tr.clickable').first();
      await expect(top).toContainText(`#${id}`);
      await expect(top).toContainText('12,000'); // 총 수량(천 단위 콤마)
      await expect(top).toContainText('운항비 최소');
      await expect(top).toContainText('확정');
      await expect(top).toContainText('admin');
      await expect(top).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/); // 확정 일시

      // '전체'·'확정' 칩 건수가 1 증가
      expect(await chipCount(page, '전체')).toBe(totalBefore + 1);
      expect(await chipCount(page, '확정')).toBe(confirmedBefore + 1);
    } finally {
      await cancelOrderIfOpen(page, id);
    }
  });

  test('[T23] 주문 상태: 확정 상태의 변경 버튼 확인과 확인창 취소 시 변화 없음', async ({ page }) => {
    await login(page);
    const id = await createOrder(page);
    try {
      // 1. 확정 상태에서는 '진행', '취소' 버튼만 보이고 '완료' 버튼은 없다 (확정 → 완료 불가)
      await expect(page.getByRole('button', { name: '진행(으)로 변경' })).toBeVisible();
      await expect(page.getByRole('button', { name: '취소(으)로 변경' })).toBeVisible();
      await expect(page.getByRole('button', { name: '완료(으)로 변경' })).toHaveCount(0);

      // 2. '진행(으)로 변경' 클릭 → 확인창에서 취소(Dismiss)
      let dialogMessage = '';
      page.once('dialog', async (dialog) => {
        dialogMessage = dialog.message();
        await dialog.dismiss();
      });
      await page.getByRole('button', { name: '진행(으)로 변경' }).click();

      // 상태 '확정' 유지, 이력 1건 그대로, 안내 메시지 없음
      await expect.poll(() => dialogMessage).toBe('진행(으)로 바꿉니다. 계속할까요?');
      await expect(page.locator('.badge')).toHaveText('확정');
      await expect(historyRows(page)).toHaveCount(1);
      await expect(page.locator('.alert')).toHaveCount(0);
    } finally {
      await cancelOrderIfOpen(page, id);
    }
  });

  test('[T25] 동시성: 두 탭에서 같은 주문을 동시에 변경하면 나중 요청은 거절', async ({ page }) => {
    await login(page);
    const id = await createOrder(page);
    const tabB = await page.context().newPage();
    try {
      // 같은 주문 상세를 탭 A, 탭 B 에서 모두 연다
      await page.goto(`/orders/${id}`);
      await tabB.goto(`/orders/${id}`);
      // 화면은 데이터를 받은 뒤 그려진다. 탭 B 가 '확정' 상태(변경 번호)를 받아 버튼을 그린 뒤에 탭 A 가 바꿔야
      // 탭 B 의 화면이 "오래된 화면"이 된다. 기다리지 않으면 탭 B 가 이미 바뀐 상태를 받아 충돌이 나지 않을 수 있다.
      await expect(tabB.getByRole('button', { name: '취소(으)로 변경' })).toBeVisible();

      // 1. 탭 A: '진행(으)로 변경' → 확인창 수락
      page.once('dialog', (d) => d.accept());
      await page.getByRole('button', { name: '진행(으)로 변경' }).click();
      await expect(page.locator('.badge')).toHaveText('진행');

      // 2. 탭 B(새로고침하지 않음): '취소(으)로 변경' → 확인창 수락
      tabB.once('dialog', (d) => d.accept());
      await tabB.getByRole('button', { name: '취소(으)로 변경' }).click();
      await expect(tabB.locator('.alert.error')).toContainText(
        '다른 사용자가 먼저 이 주문을 변경했습니다. 화면을 새로 고쳐 현재 상태를 확인한 뒤 다시 시도해 주세요',
      );

      // 주문은 삭제되지 않고 상태 '진행', 변경 이력 2건 (확정, 진행)
      await expect(tabB.locator('.badge')).toHaveText('진행');
      await expect(historyRows(tabB)).toHaveCount(2);
    } finally {
      await tabB.close();
      await cancelOrderIfOpen(page, id);
    }
  });

  test('[T30] 마스터 데이터: 잘못된 기준값은 모두 안내하고 아무것도 저장하지 않음', async ({ page }) => {
    await login(page);
    await page.goto('/master');
    const chinaMax = page.locator('input[name="maxDaily_CHINA"]');
    const chinaStock = page.locator('input[name="stockLimit_CHINA"]');
    const japanCost = page.locator('input[name="unitCost_JAPAN"]');
    const before = {
      chinaMax: await chinaMax.inputValue(),
      chinaStock: await chinaStock.inputValue(),
      japanCost: await japanCost.inputValue(),
    };

    // 1. 중국 하루 최대 생산량을 500 으로 변경 (올바른 값)
    const changed = before.chinaMax === '500' ? '501' : '500';
    await chinaMax.fill(changed);
    // 2. 중국 재고 상한과 일본 셀당 원가를 비운다 (틀린 값)
    await chinaStock.fill('');
    await japanCost.fill('');
    // 3. 저장
    await page.getByRole('button', { name: '저장' }).click();

    // 오류 사유가 한꺼번에 표시되고, 입력한 다른 값은 화면에 그대로 남는다
    await expect(page.locator('.alert.error strong')).toHaveText('저장하지 않았습니다. 아래 값을 확인하세요.');
    const errors = page.locator('.alert.error li');
    await expect(errors.filter({ hasText: '중국 재고 상한은(는) 정수로 입력하세요' })).toHaveCount(1);
    await expect(errors.filter({ hasText: '일본 셀당 원가은(는) 정수로 입력하세요' })).toHaveCount(1);
    expect(await errors.count()).toBeGreaterThanOrEqual(2);
    await expect(chinaMax).toHaveValue(changed);

    // 4. 새로 열면 모든 값이 처음과 같다 (올바른 값도 저장되지 않음)
    await page.goto('/master');
    await expect(chinaMax).toHaveValue(before.chinaMax);
    await expect(chinaStock).toHaveValue(before.chinaStock);
    await expect(japanCost).toHaveValue(before.japanCost);
  });

  test('[T31] 마스터 데이터: 척당 일 운항비 입력 검증', async ({ page }) => {
    await login(page);
    await page.goto('/master');
    const cost = page.locator('input[name="shipDailyCost"]');
    const original = await cost.inputValue();
    const save = page.getByRole('button', { name: '저장' });
    const errorList = page.locator('.alert.error');

    try {
      // 1. 0 → "0보다 커야 합니다"
      await cost.fill('0');
      await save.click();
      await expect(errorList).toContainText('척당 일 운항비는 0보다 커야 합니다');

      // 2. abc → "숫자로 입력하세요"
      await cost.fill('abc');
      await save.click();
      await expect(errorList).toContainText('척당 일 운항비(억 원)는 숫자로 입력하세요');

      // 3. 0.123456789 → 원 단위로 떨어지지 않는다는 오류 (12,345,678.9원)
      await cost.fill('0.123456789');
      await save.click();
      await expect(errorList).toContainText('원 단위로 떨어지는 값');

      // 4. 1.5 → 저장 성공 (1.5억 원 = 150,000,000원)
      await cost.fill('1.5');
      await save.click();
      await expect(page.locator('.alert.ok')).toContainText('마스터 데이터를 저장했습니다');
      await expect(cost).toHaveValue('1.5');
      const master = await (await page.request.get('/api/master')).json();
      expect(master.shipDailyCostWon).toBe(150_000_000);
    } finally {
      // 5. 원래 값으로 되돌려 저장
      await page.goto('/master');
      await cost.fill(original);
      await save.click();
      await expect(page.locator('.alert.ok')).toContainText('마스터 데이터를 저장했습니다');
    }
  });
});
