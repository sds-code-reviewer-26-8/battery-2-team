import { test, expect } from '@playwright/test';
import { DEFAULT_ORDERS, createOrder, login, masterVersion, orderTotalCount, orderVersion, removeOrder } from './helpers';

/**
 * 견고성 테스트 (docs/e2e/sy9169/test-senarios.xlsx 의 시나리오 10개)
 *
 * - 이미 실행 중인 서버(playwright.config.ts 의 baseURL)를 대상으로 한다.
 * - 시나리오마다 20초 이내(시나리오 표의 기준)에 끝나야 하므로 테스트 제한 시간을 20초로 둔다.
 * - 화면에 입력칸이 없는 시나리오(2, 4, 5)와 화면 제한을 우회하는 단계는 page.request(로그인 세션 공유)로 요청한다.
 * - 주문을 만드는 시나리오(8, 9)는 끝나면 취소(=삭제)로 정리한다. 시나리오 7 은 기준값 번호만 올린다.
 */
test.describe.configure({ timeout: 20_000 });

test.describe('견고성', () => {
  test('S1 인증·접근 통제: 로그인 없이, 로그아웃 후 보호 기능 접근 차단', async ({ page, request }) => {
    // 1. 로그인하지 않은 상태로 보호 화면을 연다
    for (const path of ['/orders', '/orders/new', '/master']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }

    // 2. 로그인 없이 데이터 요청 (request 는 로그인 세션이 없는 별도 클라이언트)
    const res = await request.post('/api/simulate', { data: { orders: DEFAULT_ORDERS } });
    expect(res.status()).toBe(401);

    // 3. 로그인 → 로그아웃 → 다시 접근
    await login(page);
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('table.grid')).toHaveCount(0);
  });

  test('S2 입력 검증: 수량 0, 음수 요청 거절', async ({ page }) => {
    await login(page);

    const zero = await page.request.post('/api/simulate', {
      data: { orders: { CHINA: 0, JAPAN: 0, VIETNAM: 0, INDONESIA: 0 } },
    });
    expect(zero.status()).toBe(400);
    const zeroBody = await zero.json();
    expect(zeroBody.error).toBe('총 생산 필요 수는 1K 이상이어야 합니다');
    expect(zeroBody.options).toBeUndefined();

    const negative = await page.request.post('/api/simulate', { data: { orders: { CHINA: -5, JAPAN: 100 } } });
    expect(negative.status()).toBe(400);
    const negativeBody = await negative.json();
    expect(negativeBody.error).toBe('중국 주문 수량은 0 이상이어야 합니다');
    expect(negativeBody.options).toBeUndefined();
  });

  test('S3 입력 검증: 총 수량 상한(100,000K) 초과 입력', async ({ page }) => {
    await login(page);
    await page.goto('/orders/new');

    // 상한을 1 넘는 값을 입력하고 시뮬레이션
    await page.locator('#total').fill('100001');
    await page.locator('#total').press('Tab'); // change 이벤트 발생
    await page.locator('#runBtn').click();
    await expect(page.locator('#inputError')).toBeVisible();
    await expect(page.locator('#inputError')).toContainText('총 생산 필요 수는 100,000K 이하여야 합니다');
    await expect(page.locator('#result')).toBeHidden();

    // 정상 값으로 되돌리면 이어서 쓸 수 있다
    await page.locator('#total').fill('12000');
    await page.locator('#total').press('Tab');
    await page.locator('#runBtn').click();
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#options .option')).toHaveCount(3);
  });

  test('S4 입력 검증: 화면 제한을 우회한 메모 1,001자 확정 요청', async ({ page }) => {
    await login(page);
    const before = await orderTotalCount(page);
    const version = await masterVersion(page);

    // 화면의 메모 입력칸은 1,000자로 막혀 있으므로 요청으로 직접 보낸다
    const res = await page.request.post('/api/orders', {
      data: { orders: DEFAULT_ORDERS, routeType: 'COST', masterVersion: version, memo: 'a'.repeat(1001) },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('메모는 1000자 이하로 입력하세요');

    expect(await orderTotalCount(page)).toBe(before);
  });

  test('S5 요청 형식: 깨진 요청 뒤에도 앱이 정상 동작', async ({ page }) => {
    // 현재 앱은 오류 응답에 서버 내부 정보(trace)를 포함하므로 아래 "내부 정보 없음" 확인에서 Fail 이 예상된다.
    test.info().annotations.push({ type: 'known-issue', description: '깨진 요청의 오류 응답에 trace 가 포함됨' });
    await login(page);
    const internalInfo = /trace|Exception|org\.springframework/;

    // 끝나지 않은 JSON
    const broken = await page.request.post('/api/simulate', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"orders":',
    });
    expect(broken.status()).toBe(400);
    expect.soft(await broken.text(), '깨진 JSON 응답에 내부 정보가 없어야 한다').not.toMatch(internalInfo);

    // 존재하지 않는 나라 이름
    const unknown = await page.request.post('/api/simulate', { data: { orders: { MARS: 100 } } });
    expect(unknown.status()).toBe(400);
    expect.soft(await unknown.text(), '알 수 없는 나라 응답에 내부 정보가 없어야 한다').not.toMatch(internalInfo);

    // 그 뒤에도 정상 요청과 화면이 동작한다
    const ok = await page.request.post('/api/simulate', { data: { orders: DEFAULT_ORDERS } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).options).toHaveLength(3);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
  });

  test('S6 기준값: 잘못된 기준값은 모두 안내하고 저장하지 않음', async ({ page }) => {
    await login(page);
    await page.goto('/master');
    const ship = page.locator('input[name="shipCount"]');
    const cost = page.locator('input[name="shipDailyCost"]');
    const china = page.locator('input[name="maxDaily_CHINA"]');
    const beforeShip = await ship.inputValue();
    const beforeCost = await cost.inputValue();
    const beforeChina = await china.inputValue();

    // 화면에서 넣을 수 있는 잘못된 값: 운항비 문자, 숫자 칸 비우기 (여러 곳을 한꺼번에)
    await cost.fill('abc');
    await china.fill('');
    await page.locator('input[name="unitCost_VIETNAM"]').fill('');
    await page.getByRole('button', { name: '저장' }).click();
    const errors = page.locator('.alert.error li');
    await expect(errors.filter({ hasText: '척당 일 운항비(억 원)는 숫자로 입력하세요' })).toHaveCount(1);
    await expect(errors.filter({ hasText: '중국 하루 최대 생산량은(는) 정수로 입력하세요' })).toHaveCount(1);
    await expect(errors.filter({ hasText: '베트남 셀당 원가은(는) 정수로 입력하세요' })).toHaveCount(1);

    // 화면 제한(최대 4척)을 우회한 요청
    const bypass = await page.request.post('/master', { form: { shipCount: '9', shipDailyCost: '1' } });
    expect(await bypass.text()).toContain('배 척수은(는) 1 이상 4 이하의 정수여야 합니다');

    // 아무것도 저장되지 않았다
    await page.goto('/master');
    await expect(ship).toHaveValue(beforeShip);
    await expect(cost).toHaveValue(beforeCost);
    await expect(china).toHaveValue(beforeChina);
  });

  test('S7 기준값: 시뮬레이션 뒤 기준값이 바뀌면 확정 거절', async ({ page }) => {
    await login(page);
    const before = await orderTotalCount(page);

    // 1. 시뮬레이션 결과를 띄운다
    await page.goto('/orders/new');
    await page.locator('#runBtn').click();
    await expect(page.locator('#result')).toBeVisible();

    // 2. 다른 탭에서 값을 바꾸지 않고 기준값을 저장한다 (기준값 번호만 올라간다)
    const other = await page.context().newPage();
    await other.goto('/master');
    await other.getByRole('button', { name: '저장' }).click();
    await expect(other.locator('.alert.ok')).toContainText('마스터 데이터를 저장했습니다');

    // 3. 처음 탭에서 확정하면 거절된다
    await page.locator('#confirmBtn').click();
    await expect(page.locator('#confirmError')).toBeVisible();
    await expect(page.locator('#confirmError')).toContainText(
      '시뮬레이션 이후 마스터 데이터가 바뀌었습니다. 다시 시뮬레이션해 주세요',
    );
    await expect(page).toHaveURL(/\/orders\/new$/);

    // 4. 주문이 만들어지지 않았다
    expect(await orderTotalCount(other)).toBe(before);
    await other.close();
  });

  test('S8 주문 상태: 허용되지 않는 상태 변경(확정 → 완료) 거절', async ({ page }) => {
    await login(page);
    const id = await createOrder(page);
    try {
      // 화면 버튼은 허용된 전이만 보여 주므로, 폼 요청으로 건너뛰기를 시도한다
      const version = await orderVersion(page, id);
      const res = await page.request.post(`/orders/${id}/status`, {
        form: { status: 'COMPLETED', version: String(version) },
      });
      // 요청은 주문 상세로 돌아오고(리다이렉트), 거절 이유가 화면에 실린다
      expect(await res.text()).toContain('확정 상태에서는 완료(으)로 바꿀 수 없습니다');

      await page.goto(`/orders/${id}`);
      await expect(page.locator('.badge')).toHaveText('확정');
      const history = page
        .locator('section.card', { has: page.getByRole('heading', { name: '상태 이력' }) })
        .locator('tbody tr');
      await expect(history).toHaveCount(1);
    } finally {
      await removeOrder(page, id);
    }
  });

  test('S9 동시성: 두 탭에서 같은 주문을 동시에 변경', async ({ page }) => {
    await login(page);
    const id = await createOrder(page);
    const tabB = await page.context().newPage();
    try {
      // 두 탭 모두 "확정" 상태의 같은 주문을 연다
      await page.goto(`/orders/${id}`);
      await tabB.goto(`/orders/${id}`);

      // 탭 A: 진행으로 변경 (확인 창에서 동의)
      page.once('dialog', (d) => d.accept());
      await page.getByRole('button', { name: '진행(으)로 변경' }).click();
      await expect(page.locator('.badge')).toHaveText('진행');

      // 탭 B(새로 고치지 않은 화면): 취소 시도 → 먼저 바꾼 쪽이 이긴다
      tabB.once('dialog', (d) => d.accept());
      await tabB.getByRole('button', { name: '취소(으)로 변경' }).click();
      await expect(tabB.locator('.alert.error')).toContainText(
        '다른 사용자가 먼저 이 주문을 변경했습니다. 화면을 새로 고쳐 현재 상태를 확인한 뒤 다시 시도해 주세요',
      );

      // 주문은 삭제되지 않고 "진행"이며 이력은 2건(확정, 진행)
      await expect(tabB.locator('.badge')).toHaveText('진행');
      const history = tabB
        .locator('section.card', { has: tabB.getByRole('heading', { name: '상태 이력' }) })
        .locator('tbody tr');
      await expect(history).toHaveCount(2);
    } finally {
      await tabB.close();
      await removeOrder(page, id);
    }
  });

  test('S10 오류 처리: 존재하지 않는 주문 번호 접근', async ({ page }) => {
    // 현재 앱은 없는 주문을 열면 HTTP 500 오류 화면이 나오므로 아래 확인에서 Fail 이 예상된다.
    test.info().annotations.push({ type: 'known-issue', description: '없는 주문 번호 접근 시 HTTP 500' });
    await login(page);

    const res = await page.goto('/orders/999999');
    expect.soft(res?.status(), '오류 화면(HTTP 500)이 아니어야 한다').not.toBe(500);
    await expect.soft(page.getByText('주문을 찾을 수 없습니다')).toBeVisible({ timeout: 3_000 });
    await expect.soft(page.getByRole('link', { name: '주문 목록' })).toBeVisible({ timeout: 3_000 });

    // 그래도 앱은 계속 쓸 수 있다
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
  });
});
