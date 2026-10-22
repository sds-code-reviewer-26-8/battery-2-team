import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_ORDERS, createOrder, login, masterVersion, orderTotalCount, orderVersion, cancelOrderIfOpen } from './helpers';

/**
 * 팀 통합 시나리오(docs/e2e/team/test-senarios.xlsx) 중 ctkim1005 담당 9건
 *   No. 3, 6, 10, 15, 17, 26, 27, 29, 34
 *
 * - 이미 실행 중인 서버(playwright.config.ts 의 baseURL)를 대상으로 한다.
 * - 시나리오당 20초 이내(팀 기준)로 제한 시간을 둔다.
 * - 주문을 만드는 시나리오(15, 26)는 끝나면 취소로 정리하고(주문은 삭제되지 않고 '취소' 상태로 남는다),
 *   기준값을 바꾸는 시나리오(29, 34)는 finally 에서 원래 값으로 되돌린다.
 * - No. 26, 27 은 현재 앱 결함 후보라 Pass 조건(설명 자료 기준)대로 실행하면 Fail 이 예상된다.
 *   known-issue 로 표시하고 soft assertion 으로 끝까지 실행한다.
 * - No. 3 은 robustness.spec.ts S1, 17 은 S4, 27 은 S10 을 이어받아 통합본의 절차·Pass 조건에 맞춘 것이다.
 */
test.describe.configure({ timeout: 20_000 });

// ---------------------------------------------------------------- 보조 함수 (주문 추가 화면)

/** 나라별 게이지 숫자칸에 값을 넣는다. 바로 오른쪽 나라가 반대로 조정된다(화면 규칙). */
async function setGauge(page: Page, country: string, value: number): Promise<void> {
  const num = page.locator(`.gauge[data-c="${country}"] .gnum`);
  await num.fill(String(value));
  await num.press('Tab'); // change 이벤트
}

/** 게이지 숫자칸의 현재 값 */
async function gaugeValue(page: Page, country: string): Promise<number> {
  return Number(await page.locator(`.gauge[data-c="${country}"] .gnum`).inputValue());
}

/** 시뮬레이션을 실행하고 결과 영역이 열릴 때까지 기다린다 */
async function runSimulation(page: Page): Promise<void> {
  await page.locator('#runBtn').click();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#options .option')).toHaveCount(3);
}

/** 선택된 경로안의 소요일과 총 비용(억원)을 읽는다 */
async function selectedOption(page: Page): Promise<{ label: string; days: number; cost: string }> {
  const sel = page.locator('#options .option.selected');
  const text = await sel.innerText();
  const days = Number(/소요\s*([\d,]+)일/.exec(text)?.[1]?.replace(/,/g, ''));
  const cost = /총 비용\s*([\d,.]+)억원/.exec(text)?.[1] ?? '';
  return { label: await sel.locator('strong').innerText(), days, cost };
}

/** 주문 상세 메타(dl.meta)에서 항목 값을 읽는다 */
function metaValue(page: Page, label: string) {
  return page.locator('dl.meta div', { has: page.locator('dt', { hasText: label }) }).locator('dd');
}

/** 주문 상세·결과 요약의 통계 값을 읽는다 */
function statValue(page: Page, label: string) {
  return page.locator('#summary .stats div', { has: page.locator('span', { hasText: label }) }).locator('b');
}

/** 상태 이력 표의 행 */
function historyRows(page: Page) {
  return page.locator('section.card', { has: page.getByRole('heading', { name: '상태 이력' }) }).locator('tbody tr');
}

/** 주문 목록의 상태 칩 건수 (목록 화면으로 이동한다) */
async function chipCount(page: Page, label: string): Promise<number> {
  await page.goto('/orders');
  const text = await page.locator('.filters a.chip', { hasText: label }).locator('.count').innerText();
  return parseInt(text.replace(/,/g, ''), 10);
}

/** 마스터 화면에서 값 하나를 바꿔 저장한다 */
async function saveMasterField(page: Page, name: string, value: string): Promise<void> {
  await page.goto('/master');
  await page.locator(`input[name="${name}"]`).fill(value);
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.locator('.alert.ok')).toContainText('마스터 데이터를 저장했습니다');
}

/** 주문이 있을 때만 취소로 정리한다. 없는 주문이면 건너뛴다. */
async function removeIfExists(page: Page, id: number): Promise<void> {
  const res = await page.request.get(`/api/orders/${id}`);
  if (res.status() === 200) await cancelOrderIfOpen(page, id);
}

// ---------------------------------------------------------------- 시나리오

test.describe('ctkim1005 담당', () => {
  test('T03 접근 통제: 로그인 없이, 로그아웃 후 보호 기능 접근 차단', async ({ page, request }) => {
    // 1. 로그인 없이 보호 화면 3개 → 모두 /login
    for (const path of ['/orders', '/orders/new', '/master']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator('table.grid')).toHaveCount(0);
    }

    // 2. 로그인 없이 데이터 요청 → 401 (request 는 세션이 없는 별도 클라이언트)
    const res = await request.post('/api/simulate', { data: { orders: DEFAULT_ORDERS } });
    expect(res.status()).toBe(401);

    // 3. 로그인 → 로그아웃 → /orders 재접속 → /login, 주문 정보 없음
    await login(page);
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('table.grid')).toHaveCount(0);
  });

  test('T06 주문 추가: 기본 수량(12,000K)으로 시뮬레이션과 방문 횟수 표시', async ({ page }) => {
    await login(page);
    await page.goto('/orders/new');

    // 초기값: 총 12,000K, 네 나라 각 3,000K, 방문 횟수 일본 2회·나머지 1회 (기본 마스터 기준)
    await expect(page.locator('#total')).toHaveValue('12000');
    for (const c of ['CHINA', 'JAPAN', 'VIETNAM', 'INDONESIA']) {
      await expect(page.locator(`.gauge[data-c="${c}"] .gnum`)).toHaveValue('3000');
    }
    await expect(page.locator('.gauge[data-c="JAPAN"] .gvisits')).toHaveText('방문 2회');
    for (const c of ['CHINA', 'VIETNAM', 'INDONESIA']) {
      await expect(page.locator(`.gauge[data-c="${c}"] .gvisits`)).toHaveText('방문 1회');
    }

    // 값을 바꾸지 않고 시뮬레이션 실행
    await runSimulation(page);

    // 경로안 3개: 운항비 최소 / 가장 빠르게 / 가까운 곳부터, 각각 소요일·총 비용 표시
    const options = page.locator('#options .option');
    await expect(options.locator('strong')).toHaveText(['운항비 최소', '가장 빠르게', '가까운 곳부터']);
    for (let i = 0; i < 3; i++) {
      await expect(options.nth(i)).toContainText(/소요 \d+일/);
      await expect(options.nth(i)).toContainText(/총 비용 [\d,.]+억원/);
    }
    // 기본 선택은 '운항비 최소'
    await expect(page.locator('#options .option.selected strong')).toHaveText('운항비 최소');

    // 지도 애니메이션 영역, 상세 표, '3. 주문 확정' 영역 표시
    await expect(page.locator('#anim')).toBeVisible();
    await expect(page.locator('#details')).toContainText('배 경로');
    await expect(page.getByRole('heading', { name: '3. 주문 확정' })).toBeVisible();

    // 상세 표의 필요 방문 횟수: 일본 2회, 중국·베트남·인도네시아 각 1회
    const orderRows = page.locator('#details table').first().locator('tbody tr');
    await expect(orderRows.filter({ hasText: '일본' })).toContainText('2회');
    for (const name of ['중국', '베트남', '인도네시아']) {
      await expect(orderRows.filter({ hasText: name })).toContainText('1회');
    }
  });

  test('T10 주문 추가: 수량이 0인 나라가 있어도 시뮬레이션', async ({ page }) => {
    await login(page);
    await page.goto('/orders/new');

    // 1. 중국을 6000 으로 → 바로 오른쪽 일본이 0K 가 된다 (합계 12,000K 유지)
    await setGauge(page, 'CHINA', 6000);
    expect(await gaugeValue(page, 'CHINA')).toBe(6000);
    expect(await gaugeValue(page, 'JAPAN')).toBe(0);
    await expect(page.locator('.gauge[data-c="JAPAN"] .gvisits')).toHaveText('방문 0회');

    // 2. 시뮬레이션 → 오류 없이 3개 경로안
    await runSimulation(page);
    await expect(page.locator('#inputError')).toBeHidden();

    // 결과 상세: 나라별 주문 수량 표에서 일본 0K·0회, 배 경로 표에는 일본 수거 없음
    const tables = page.locator('#details table');
    const japanRow = tables.nth(0).locator('tbody tr').filter({ hasText: '일본' });
    await expect(japanRow).toContainText('0회');
    await expect(tables.nth(1)).not.toContainText('일본');
  });

  test('T15 주문 확정: 경로안 선택 후 메모와 함께 확정', async ({ page }) => {
    await login(page);
    const before = await orderTotalCount(page);
    let id: number | undefined;
    try {
      // [사전] 시뮬레이션 결과 표시
      await page.goto('/orders/new');
      await runSimulation(page);

      // 1. '가장 빠르게' 선택, 확정 직전 결과값 기록
      await page.locator('#options .option[data-type="FAST"]').click();
      const picked = await selectedOption(page);
      expect(picked.label).toBe('가장 빠르게');

      // 2. 메모 입력  3. 주문 확정
      await page.locator('#memo').fill('3분기 긴급 물량');
      await page.locator('#confirmBtn').click();

      // /orders/{id} 상세로 이동
      await expect(page).toHaveURL(/\/orders\/\d+$/);
      id = Number(new URL(page.url()).pathname.split('/').pop());

      // 상태 '확정', 경로 '가장 빠르게', 메모, 작성자 admin
      await expect(page.locator('.badge')).toHaveText('확정');
      await expect(metaValue(page, '경로')).toHaveText('가장 빠르게');
      await expect(metaValue(page, '메모')).toHaveText('3분기 긴급 물량');
      await expect(metaValue(page, '작성자')).toHaveText('admin');

      // 상세의 소요일·총 비용이 확정 직전 결과와 일치
      await expect(statValue(page, '소요 일수')).toHaveText(`${picked.days}일`);
      await expect(statValue(page, '총 비용')).toHaveText(`${picked.cost}억원`);

      // 상태 이력 1건: '-' → '확정', admin
      const rows = historyRows(page);
      await expect(rows).toHaveCount(1);
      await expect(rows.first().locator('td').nth(1)).toHaveText('-');
      await expect(rows.first().locator('td').nth(2)).toHaveText('확정');
      await expect(rows.first().locator('td').nth(3)).toHaveText('admin');

      // 주문 1건 생성
      expect(await orderTotalCount(page)).toBe(before + 1);
    } finally {
      if (id) await cancelOrderIfOpen(page, id);
    }
  });

  test('T17 주문 확정: 메모 1,000자 제한 — 화면 입력 제한과 우회 요청 거절', async ({ page }) => {
    await login(page);
    const before = await orderTotalCount(page);

    // 1. 화면: 입력칸이 1,000자까지만 받는다 (maxlength). 999자 넣고 2자를 더 타이핑하면 1,000자에서 멈춘다
    await page.goto('/orders/new');
    await runSimulation(page);
    const memo = page.locator('#memo');
    await expect(memo).toHaveAttribute('maxlength', '1000');
    await memo.fill('a'.repeat(999));
    await memo.pressSequentially('bb');
    expect((await memo.inputValue()).length).toBe(1000);

    // 2. 우회 요청: 기준값 번호를 읽고 메모 1,001자로 확정 요청 → 400
    const version = await masterVersion(page);
    const res = await page.request.post('/api/orders', {
      data: { orders: DEFAULT_ORDERS, routeType: 'COST', masterVersion: version, memo: 'a'.repeat(1001) },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('메모는 1000자 이하로 입력하세요');

    // 3. 주문 건수 변화 없음
    expect(await orderTotalCount(page)).toBe(before);
  });

  test('T26 주문 상태: 확정·진행 상태에서 취소', async ({ page }) => {
    // 취소해도 주문을 지우지 않고 '취소' 상태의 최종 상태로 남긴다 (설명 자료 기준, PRD §10-1 / INTENT §7-1).
    await login(page);
    const canceledBefore = await chipCount(page, '취소');

    // [사전] 확정 주문 1건, 진행 주문 1건
    const confirmedId = await createOrder(page);
    const progressId = await createOrder(page);
    try {
      await page.goto(`/orders/${progressId}`);
      page.once('dialog', (d) => d.accept());
      await page.getByRole('button', { name: '진행(으)로 변경' }).click();
      await expect(page.locator('.badge')).toHaveText('진행');

      // 1. 확정 주문 취소  2. 진행 주문 취소 → 각각 '취소' 상태로 남아야 한다
      for (const id of [confirmedId, progressId]) {
        await page.goto(`/orders/${id}`);
        page.once('dialog', (d) => d.accept());
        await page.getByRole('button', { name: '취소(으)로 변경' }).click();
        await expect.soft(page.locator('.badge'), `주문 #${id} 가 '취소' 상태로 남아야 한다`).toHaveText('취소', { timeout: 1_000 });
        await expect
          .soft(page.getByText('최종 상태라 더 바꿀 수 없습니다.'), `주문 #${id} 최종 상태 안내`)
          .toBeVisible({ timeout: 1_000 });
      }

      // 목록의 '취소' 칩 건수 +2 (칩은 목록 화면에 있으므로 목록으로 이동해서 읽는다)
      await page.goto('/orders');
      expect.soft(await chipCount(page, '취소'), "목록 '취소' 칩 건수").toBe(canceledBefore + 2);
    } finally {
      await removeIfExists(page, confirmedId);
      await removeIfExists(page, progressId);
    }
  });

  test('T27 주문 상태: 존재하지 않는 주문 번호 접근 (결함 후보)', async ({ page }) => {
    // 현재 앱은 없는 주문을 열면 HTTP 500 오류 화면이 나오므로 Fail 이 예상된다.
    test.info().annotations.push({ type: 'known-issue', description: '없는 주문 번호 접근 시 HTTP 500' });
    await login(page);

    // 1. 없는 주문 번호 → 오류 화면이 아니라 안내 + 메뉴 사용 가능
    const res = await page.goto('/orders/999999');
    expect.soft(res?.status(), '오류 화면(HTTP 500)이 아니어야 한다').not.toBe(500);
    await expect.soft(page.getByText('주문을 찾을 수 없습니다', { exact: true }), '안내 문구').toBeVisible({ timeout: 2_000 });
    await expect.soft(page.getByRole('link', { name: '주문 목록' }), '메뉴 사용 가능').toBeVisible({ timeout: 2_000 });

    // 2. 메뉴로 /orders 이동 → 정상
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
  });

  test('T29 마스터 데이터: 값 수정 후 저장하면 유지됨', async ({ page }) => {
    await login(page);
    await page.goto('/master');
    const china = page.locator('input[name="maxDaily_CHINA"]');
    const original = await china.inputValue(); // 기본값 400
    try {
      // 1~2. 중국 하루 최대 생산량 500 으로 저장 → 저장 메시지
      await saveMasterField(page, 'maxDaily_CHINA', '500');

      // 3. 새로고침 후에도 500 유지
      await page.reload();
      await expect(china).toHaveValue('500');
    } finally {
      // 4. 원래 값으로 복원
      await saveMasterField(page, 'maxDaily_CHINA', original);
      await page.reload();
      await expect(china).toHaveValue(original);
    }
  });

  test('T34 마스터 데이터: 항로 일수 변경 시 소요일 증가', async ({ page }) => {
    await login(page);
    await page.goto('/master');
    const route = page.locator('input[name="days_KOREA_CHINA"]');
    const original = await route.inputValue(); // 기본값 1

    // [사전] 변경 전 소요일: 중국만 3,000K (API 로 기준값 측정)
    const baseline = await page.request.post('/api/simulate', { data: { orders: { CHINA: 3000 } } });
    expect(baseline.status()).toBe(200);
    const daysBefore: number = (await baseline.json()).options.find((o: { type: string }) => o.type === 'COST').totalDays;

    try {
      // 1. 한국–중국 항해 일수 1 → 5 로 저장
      await saveMasterField(page, 'days_KOREA_CHINA', '5');

      // 2. 화면에서 중국만 3,000K 로 맞춰 시뮬레이션 (게이지는 오른쪽 나라와 짝으로 움직인다)
      await page.goto('/orders/new');
      await page.locator('#total').fill('3000');
      await page.locator('#total').press('Tab'); // 네 나라 750K 씩
      await setGauge(page, 'CHINA', 3000); // 중국 1500 / 일본 0
      await setGauge(page, 'VIETNAM', 0); // 베트남 0 / 인도네시아 1500
      await setGauge(page, 'INDONESIA', 0); // 인도네시아 0 / 중국 3000
      expect(await gaugeValue(page, 'CHINA')).toBe(3000);
      for (const c of ['JAPAN', 'VIETNAM', 'INDONESIA']) expect(await gaugeValue(page, c)).toBe(0);
      await runSimulation(page);

      // 변경 전보다 총 소요일 증가 (왕복이 길어짐)
      const after = await selectedOption(page);
      expect(after.label).toBe('운항비 최소');
      expect(after.days).toBeGreaterThan(daysBefore);
      await expect(statValue(page, '소요 일수')).toHaveText(`${after.days}일`);
    } finally {
      // 3. 원래 값으로 복원
      await saveMasterField(page, 'days_KOREA_CHINA', original);
      await page.reload();
      await expect(route).toHaveValue(original);
    }
  });
});

// ---------------------------------------------------------------- 신규: 필요 납기 (TASK-004-due-date)

/** 로컬 날짜 기준 오늘 + days 를 yyyy-MM-dd 로 (브라우저와 같은 PC 의 시간대) */
function localDate(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 경로안 버튼의 소요일 */
async function optionDays(page: Page, type: string): Promise<number> {
  const text = await page.locator(`#options .option[data-type="${type}"]`).innerText();
  return Number(/소요\s*([\d,]+)일/.exec(text)?.[1]?.replace(/,/g, ''));
}

test.describe('신규 필요 납기일 지정과 납기 초과 경로안 빨간 표시', () => {
  test('T-DUE 납기 입력 범위·초과 표시·확정·상세·우회 요청 거절', async ({ page }) => {
    await login(page);
    const before = await orderTotalCount(page);
    let id: number | undefined;
    try {
      // 1. 기본은 '가능한 빨리' 체크, 납기일 입력은 비활성. min/max = 오늘+5 / 오늘+50
      await page.goto('/orders/new');
      const asap = page.locator('#dueAsap');
      const date = page.locator('#dueDate');
      await expect(asap).toBeChecked();
      await expect(date).toBeDisabled();
      await expect(date).toHaveAttribute('min', localDate(5));
      await expect(date).toHaveAttribute('max', localDate(50));

      // 2. 시뮬레이션 후 '가능한 빨리' 해제, 납기 = '가장 빠르게' 소요일 (다른 E2E 가 마스터를 바꿔도 성립)
      await runSimulation(page);
      await expect(page.locator('#options .over-due')).toHaveCount(0);
      const due = await optionDays(page, 'FAST');
      expect(due).toBeGreaterThanOrEqual(5);
      expect(due).toBeLessThanOrEqual(50);
      await asap.uncheck();
      await expect(date).toBeEnabled();
      await date.fill(localDate(due));

      for (const type of ['COST', 'FAST', 'NEAR']) {
        const opt = page.locator(`#options .option[data-type="${type}"]`);
        if ((await optionDays(page, type)) > due) {
          await expect(opt).toHaveClass(/over-due/);
          await expect(opt).toContainText('납기 초과');
        } else {
          await expect(opt).not.toHaveClass(/over-due/);
          await expect(opt).not.toContainText('납기 초과');
        }
      }
      // 기본 마스터(COST 26일 / FAST 20일 / NEAR 21일)라면 COST·NEAR 가 빨간 안
      expect(await optionDays(page, 'COST')).toBeGreaterThan(due);
      await expect(page.locator('#result')).toBeVisible(); // 납기를 바꿔도 결과는 사라지지 않는다

      // 3. '가능한 빨리' 체크 → 입력 비활성, 빨간 표시 즉시 사라짐
      await asap.check();
      await expect(date).toBeDisabled();
      await expect(page.locator('#options .over-due')).toHaveCount(0);
      await expect(page.locator('#options')).not.toContainText('납기 초과');

      // 4. 다시 해제(날짜 유지) → 빨간 안 '운항비 최소' 로도 확정 가능
      await asap.uncheck();
      await expect(page.locator('#options .option[data-type="COST"]')).toHaveClass(/over-due/);
      await page.locator('#options .option[data-type="COST"]').click();
      await page.locator('#confirmBtn').click();
      await expect(page).toHaveURL(/\/orders\/\d+$/);
      id = Number(new URL(page.url()).pathname.split('/').pop());
      await expect(metaValue(page, '경로')).toHaveText('운항비 최소');
      await expect(metaValue(page, '필요 납기')).toHaveText(`${localDate(due)} 납기 초과`);
      expect(await orderTotalCount(page)).toBe(before + 1);

      // 5. 화면을 거치지 않은 범위 밖 요청 → 400 + 이유, 주문 건수 불변
      const version = await masterVersion(page);
      for (const days of [4, 51]) {
        const res = await page.request.post('/api/orders', {
          data: { orders: DEFAULT_ORDERS, routeType: 'COST', masterVersion: version, dueAsap: false, dueDate: localDate(days) },
        });
        expect(res.status()).toBe(400);
        expect((await res.json()).error).toBe('필요 납기일은 오늘부터 5~50일 사이로 선택하세요');
      }
      expect(await orderTotalCount(page)).toBe(before + 1);
    } finally {
      if (id) await cancelOrderIfOpen(page, id);
    }
  });

  test('T-DUE2 납기 정보 없는 주문(기존 형식 요청)의 상세는 필요 납기 \'-\'', async ({ page }) => {
    await login(page);
    // 납기 기능 전 형식의 확정 요청(납기 필드 없음)으로 주문을 만든다
    const res = await page.request.post('/api/orders', {
      data: { orders: DEFAULT_ORDERS, routeType: 'COST', masterVersion: await masterVersion(page) },
    });
    expect(res.status()).toBe(200);
    const id: number = (await res.json()).id;
    try {
      await page.goto(`/orders/${id}`);
      await expect(metaValue(page, '필요 납기')).toHaveText('-');
      await expect(metaValue(page, '작성자')).toHaveText('admin');
      await expect(page.locator('h1 .badge')).toHaveText('확정');
      await expect(statValue(page, '소요 일수')).toBeVisible();
    } finally {
      await cancelOrderIfOpen(page, id);
    }
  });
});
