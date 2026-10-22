import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_ORDERS, createOrder, login, orderTotalCount, orderVersion, cancelOrderIfOpen } from './helpers';

/**
 * 담당자 ssw60040-prog 의 E2E 시나리오 9개 (docs/e2e/team/test-senarios.xlsx 의 No. 4, 9, 13, 19, 21, 24, 32, 33, 36)
 *
 * - 이미 실행 중인 서버(playwright.config.ts 의 baseURL)를 대상으로 한다.
 * - 시나리오마다 20초 이내(시나리오 표의 기준)에 끝나야 하므로 테스트 제한 시간을 20초로 둔다.
 * - 화면에 입력칸이 없거나 화면 제한을 우회하는 단계는 page.request(로그인 세션 공유)로 요청한다.
 * - 주문을 만드는 시나리오(19, 21, 24)는 끝나면 취소로 정리한다(주문은 삭제되지 않고 '취소' 상태로 남는다). "완료"는 최종 상태라 정리할 수 없어
 *   시나리오 21 이 만든 완료 주문 1건은 남는다.
 * - 기준값을 바꾸는 시나리오(32, 33)는 끝에서 원래 값으로 되돌린다. 순차 실행(workers=1)이 전제이다.
 * - 안내 시트에 따라 robustness.spec.ts 의 S3(No.13), S8(No.24), S5(No.36), S6 일부(No.32)와 같은 흐름을
 *   통합본의 절차·Pass 조건에 맞춰 이 파일에서 이어받았다.
 */
test.describe.configure({ timeout: 20_000 });

const COUNTRIES = ['CHINA', 'JAPAN', 'VIETNAM', 'INDONESIA'] as const;

/** 주문 추가 화면의 나라별 수량 입력칸 */
const gauge = (page: Page, country: string) => page.locator(`.gauge[data-c="${country}"] .gnum`);

/** 수량 입력칸에 값을 넣고 change 이벤트를 발생시킨다. (Tab 으로 포커스를 옮겨야 change 가 난다) */
async function setGauge(page: Page, country: string, value: number): Promise<void> {
  await gauge(page, country).fill(String(value));
  await gauge(page, country).press('Tab');
}

/** 네 나라의 현재 수량 [중국, 일본, 베트남, 인도네시아] */
async function gaugeValues(page: Page): Promise<number[]> {
  return Promise.all(COUNTRIES.map(async (c) => Number(await gauge(page, c).inputValue())));
}

/** 상태를 화면 버튼 대신 폼 요청으로 바꾼다. (확인 창 처리와 화면 이동 시간을 아끼기 위함) */
async function changeStatus(page: Page, id: number, status: 'IN_PROGRESS' | 'COMPLETED'): Promise<void> {
  const version = await orderVersion(page, id);
  const res = await page.request.post(`/api/orders/${id}/status`, { data: { status, version } });
  expect(res.ok()).toBeTruthy();
}

/** 기준값 화면에서 입력칸을 채워 저장하고, 저장 안내가 보일 때까지 기다린다. */
async function saveMaster(page: Page, fields: Record<string, string>): Promise<void> {
  await page.goto('/master');
  for (const [name, value] of Object.entries(fields)) {
    await page.locator(`input[name="${name}"]`).fill(value);
  }
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.locator('.alert.ok')).toContainText('마스터 데이터를 저장했습니다');
}

test.describe('ssw60040-prog 담당 시나리오', () => {
  test('No.4 로그인 상태에서 /login 또는 / 접속 시 주문 목록으로 이동', async ({ page }) => {
    // [사전 조건] 로그인 상태
    await login(page);

    // 1. /login 접속 → 주문 목록으로 이동
    await page.goto('/login');
    await expect(page).toHaveURL(/\/orders(;.*)?$/);

    // 2. / 접속 → 주문 목록으로 이동
    await page.goto('/');
    await expect(page).toHaveURL(/\/orders(;.*)?$/);
    await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
  });

  test('No.9 게이지 경계값 보정(초과·음수)', async ({ page }) => {
    // [사전 조건] 기본값 12,000K (각 3,000K)
    await login(page);
    await page.goto('/orders/new');
    expect(await gaugeValues(page)).toEqual([3000, 3000, 3000, 3000]);

    // 1. 중국 수량에 99999 입력 → 중국·일본 합(6,000K)까지만 반영
    await setGauge(page, 'CHINA', 99999);
    await expect(gauge(page, 'CHINA')).toHaveValue('6000');
    await expect(gauge(page, 'JAPAN')).toHaveValue('0');

    // 2. 중국 수량에 -5 입력 → 0 미만은 0 으로 보정
    await setGauge(page, 'CHINA', -5);
    await expect(gauge(page, 'CHINA')).toHaveValue('0');
    await expect(gauge(page, 'JAPAN')).toHaveValue('6000');

    // 합계는 항상 12,000K (다른 두 나라는 그대로)
    const values = await gaugeValues(page);
    expect(values.reduce((a, b) => a + b, 0)).toBe(12000);
    expect(values.slice(2)).toEqual([3000, 3000]);
  });

  test('No.13 총 수량 상한(100,000K) 초과 거절과 복구', async ({ page }) => {
    // [사전 조건] 로그인 상태, 주문 목록의 '전체' 건수를 기록
    await login(page);
    const before = await orderTotalCount(page);

    // 1. 총 생산 필요 수에 100001 입력 후 시뮬레이션 실행 → 오류 표시, 결과 영역 미표시
    await page.goto('/orders/new');
    await page.locator('#total').fill('100001');
    await page.locator('#total').press('Tab');
    await page.locator('#runBtn').click();
    await expect(page.locator('#inputError')).toBeVisible();
    await expect(page.locator('#inputError')).toContainText('총 생산 필요 수는 100,000K 이하여야 합니다');
    await expect(page.locator('#result')).toBeHidden();

    // 2. 총 수량을 12000 으로 되돌려 다시 실행 → 3가지 안이 정상으로 표시
    await page.locator('#total').fill('12000');
    await page.locator('#total').press('Tab');
    await page.locator('#runBtn').click();
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#options .option')).toHaveCount(3);

    // 3. 주문 목록의 '전체' 건수 확인 → 불변
    expect(await orderTotalCount(page)).toBe(before);
  });

  test('No.19 확정된 주문 상세에 저장된 계획 표시', async ({ page }) => {
    await login(page);
    // [사전 조건] 주문 1건 확정 완료 (확정되면 상세 화면으로 이동한다)
    const id = await createOrder(page);
    try {
      // 1. 주문 상세 화면 확인 → 요약, 상세 표, 지도 애니메이션(저장된 계획)
      await expect(page.getByRole('heading', { name: /^요약/ })).toBeVisible();
      await expect(page.getByRole('heading', { name: '나라별 주문 수량' })).toBeVisible();
      await expect(page.locator('#details table.grid').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: '지도 애니메이션 (저장된 계획)' })).toBeVisible();
      const summary = await page.locator('#summary').innerText();
      const details = await page.locator('#details').innerText();
      expect(summary).toContain('총 비용');

      // 2. 화면을 새로고침 → 같은 내용 (저장된 계획 사용)
      await page.reload();
      await expect(page.getByRole('heading', { name: '지도 애니메이션 (저장된 계획)' })).toBeVisible();
      // innerText 로 읽은 값끼리 비교한다 (toHaveText 는 공백을 정규화해서 줄바꿈이 있는 innerText 와 맞지 않는다)
      await expect.poll(() => page.locator('#summary').innerText()).toBe(summary);
      await expect.poll(() => page.locator('#details').innerText()).toBe(details);
    } finally {
      await cancelOrderIfOpen(page, id);
    }
  });

  test('No.21 상태 필터와 건수 집계 일치', async ({ page }) => {
    await login(page);
    const created: number[] = [];
    try {
      // 화면에 나올 수 있는 상태. 취소한 주문도 목록에 남는다.
      const OPEN_AND_DONE = ['확정', '진행', '완료'];
      const ALL_STATUSES = [...OPEN_AND_DONE, '취소'];

      // [사전 조건] 확정·진행·완료 상태의 주문이 각각 1건 이상
      const confirmed = await createOrder(page);
      created.push(confirmed);
      const inProgress = await createOrder(page);
      created.push(inProgress);
      await changeStatus(page, inProgress, 'IN_PROGRESS');
      const completed = await createOrder(page);
      created.push(completed);
      await changeStatus(page, completed, 'IN_PROGRESS');
      await changeStatus(page, completed, 'COMPLETED');

      await page.goto('/orders');
      const chip = (label: string) => page.locator('.filters a.chip', { hasText: new RegExp(`^\\s*${label}`) });
      const chipCount = async (label: string) =>
        parseInt((await chip(label).locator('.count').innerText()).replace(/,/g, ''), 10);
      const rows = page.locator('table.grid tbody tr.clickable');
      const rowStatuses = async () => new Set(await rows.locator('.badge').allInnerTexts());

      // 1. '진행' 칩 클릭 → 진행 주문만 표시, 칩 강조, URL 에 status=IN_PROGRESS
      await chip('진행').click();
      await expect(page).toHaveURL(/status=IN_PROGRESS/);
      await expect(chip('진행')).toHaveClass(/active/);
      expect(await rowStatuses()).toEqual(new Set(['진행']));
      expect(await rows.count()).toBe(await chipCount('진행'));
      expect(await chipCount('진행')).toBeGreaterThanOrEqual(1);

      // 2. '완료' 칩 클릭 → 완료 주문만 표시
      await chip('완료').click();
      await expect(page).toHaveURL(/status=COMPLETED/);
      expect(await rowStatuses()).toEqual(new Set(['완료']));
      expect(await rows.count()).toBe(await chipCount('완료'));

      // 3. '전체' 칩 클릭 → 모든 주문 표시
      await chip('전체').click();
      await expect(page).not.toHaveURL(/status=/);
      // 취소한 주문도 목록에 남으므로(다른 시나리오가 정리하며 취소한 주문 포함) '취소'가 섞여 있을 수 있다
      const allStatuses = await rowStatuses();
      for (const label of OPEN_AND_DONE) expect(allStatuses.has(label), `'${label}' 주문이 전체 목록에 있어야 한다`).toBe(true);
      expect([...allStatuses].filter((s) => !ALL_STATUSES.includes(s))).toEqual([]);

      // 4. 각 칩의 건수 = 필터링된 행 수, 전체 = 상태별 건수의 합
      const counts: Record<string, number> = {};
      for (const label of ALL_STATUSES) {
        await chip(label).click();
        counts[label] = await chipCount(label);
        expect(await rows.count(), `'${label}' 칩 건수와 행 수`).toBe(counts[label]);
      }
      await chip('전체').click();
      const total = await chipCount('전체');
      expect(await rows.count()).toBe(total);
      expect(total).toBe(Object.values(counts).reduce((a, b) => a + b, 0));
    } finally {
      // 만든 주문을 모두 정리한다. 완료 주문처럼 더 바꿀 수 없는 주문은 cancelOrderIfOpen 이 알아서 건너뛴다.
      for (const id of created) await cancelOrderIfOpen(page, id);
    }
  });

  test('No.24 허용되지 않는 상태 변경(확정 → 완료) 요청 거절', async ({ page }) => {
    // [사전 조건] 로그인 상태
    await login(page);
    // 1. 시뮬레이션과 확정으로 주문 1건 생성 (상태 '확정')
    const id = await createOrder(page);
    try {
      // 2. 주문 상세의 변경 번호(version)를 읽어, 화면 버튼 없이 POST /orders/{id}/status 로 status=COMPLETED 전송
      const version = await orderVersion(page, id);
      const res = await page.request.post(`/api/orders/${id}/status`, {
        data: { status: 'COMPLETED', version },
      });
      // 요청은 400 으로 거절되고, 거절 이유가 응답에 실린다
      expect(await res.text()).toContain('확정 상태에서는 완료(으)로 바꿀 수 없습니다');

      // 3. 주문 상세 다시 확인 → 상태는 여전히 '확정', 변경 이력은 1건
      await page.goto(`/orders/${id}`);
      await expect(page.locator('.badge')).toHaveText('확정');
      const history = page
        .locator('section.card', { has: page.getByRole('heading', { name: '상태 이력' }) })
        .locator('tbody tr');
      await expect(history).toHaveCount(1);
    } finally {
      await cancelOrderIfOpen(page, id);
    }
  });

  test('No.32 배 척수 범위(1~4): 화면 검증과 우회 요청 거절', async ({ page }) => {
    await login(page);
    // [사전 조건] /master 화면, 현재 배 척수 기록
    await page.goto('/master');
    const ship = page.locator('input[name="shipCount"]');
    const original = await ship.inputValue();
    const save = page.getByRole('button', { name: '저장' });
    try {
      // 1. 배 척수 1 저장, 4 저장 → 저장 성공
      for (const value of ['1', '4']) {
        await saveMaster(page, { shipCount: value });
        await expect(ship).toHaveValue(value);
      }

      // 2. 5 입력 시도, 0 입력 시도 → 브라우저 검증(max=4, min=1)이 제출을 막음 (서버로 전송되지 않음)
      const posts: string[] = [];
      page.on('request', (r) => {
        if (r.method() === 'POST' && /\/master$/.test(new URL(r.url()).pathname)) posts.push(r.url());
      });
      for (const value of ['5', '0']) {
        await ship.fill(value);
        await save.click();
        expect(await ship.evaluate((el: HTMLInputElement) => el.validity.valid), `${value} 은 화면 검증에 걸려야 한다`).toBe(false);
        await expect(page).toHaveURL(/\/master$/);
      }
      expect(posts, '서버로 전송된 저장 요청이 없어야 한다').toHaveLength(0);

      // 3. 화면 제한을 우회해 shipCount=9 로 POST /master 전송 → 오류 안내, 값 저장되지 않음
      const bypass = await page.request.post('/api/master', { data: { shipCount: '9', shipDailyCost: '1' } });
      expect(await bypass.text()).toContain('배 척수은(는) 1 이상 4 이하의 정수여야 합니다');
      await page.goto('/master');
      await expect(ship).toHaveValue('4');
    } finally {
      // 4. 원래 값으로 되돌려 저장
      await saveMaster(page, { shipCount: original });
    }
  });

  test('No.33 저장한 기준값이 이후 시뮬레이션에 반영', async ({ page }) => {
    await login(page);
    // [사전 조건] /master 화면 (원래 값을 기록해 둔다)
    await page.goto('/master');
    const originalShips = await page.locator('input[name="shipCount"]').inputValue();
    const originalLimit = await page.locator('input[name="stockLimit_JAPAN"]').inputValue();
    try {
      // 1. 배 척수를 1 로 저장
      await saveMaster(page, { shipCount: '1' });
      // 2. 일본 재고 상한을 3000 으로 저장
      await saveMaster(page, { stockLimit_JAPAN: '3000' });

      // 3. 주문 추가에서 기본값(일본 3,000K)으로 시뮬레이션 실행
      await page.goto('/orders/new');
      await page.locator('#runBtn').click();
      await expect(page.locator('#result')).toBeVisible();
      await expect(page.locator('#options .option')).toHaveCount(3);
      // 모든 경로안의 '배 N척' 이 1척
      await expect(page.locator('#options .option').filter({ hasNotText: '배 1척' })).toHaveCount(0);
      // 일본 '방문 1회' (기존 2회)
      await expect(page.locator('.gauge[data-c="JAPAN"] .gvisits')).toHaveText('방문 1회');
    } finally {
      // 4. 두 값을 원래대로 되돌려 저장
      await saveMaster(page, { shipCount: originalShips, stockLimit_JAPAN: originalLimit });
    }
  });

  test('No.36 깨진 요청 뒤에도 앱이 정상 동작', async ({ page }) => {
    // 현재 앱은 오류 응답에 서버 내부 정보(trace)를 포함하므로 아래 "내부 정보 없음" 확인에서 Fail 이 예상된다.
    test.info().annotations.push({ type: 'known-issue', description: '깨진 요청의 오류 응답에 trace 가 포함됨' });
    // [사전 조건] 로그인 상태
    await login(page);
    const internalInfo = /trace|Exception|org\.springframework/;

    // 1. POST /api/simulate 에 끝나지 않은 JSON 전송 → HTTP 400, 내부 정보 없음
    const broken = await page.request.post('/api/simulate', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"orders":',
    });
    expect(broken.status()).toBe(400);
    expect.soft(await broken.text(), '깨진 JSON 응답에 내부 정보가 없어야 한다').not.toMatch(internalInfo);

    // 2. 존재하지 않는 나라 이름 전송 → HTTP 400, 내부 정보 없음
    const unknown = await page.request.post('/api/simulate', { data: { orders: { MARS: 100 } } });
    expect(unknown.status()).toBe(400);
    expect.soft(await unknown.text(), '알 수 없는 나라 응답에 내부 정보가 없어야 한다').not.toMatch(internalInfo);

    // 3. 정상 수량으로 다시 시뮬레이션하고 /orders 접속 → 3가지 안이 나오고 목록이 열린다
    const ok = await page.request.post('/api/simulate', { data: { orders: DEFAULT_ORDERS } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).options).toHaveLength(3);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
  });
});
