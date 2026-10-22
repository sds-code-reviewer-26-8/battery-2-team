import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_ORDERS, cancelOrderIfOpen, login, orderTotalCount } from './helpers';
import { changeStatus } from './ui-helpers';

/**
 * 고객사 기능 시나리오 (주문 확정 때 고객사 입력, 확정 후 수정, 완료·취소 후 수정 불가)
 *
 * C1  확정 때 입력한 고객사가 상세에 보이고(앞뒤 공백 제거), 입력하지 않으면 확정이 거절됨(필수)
 * C2  확정·진행 상태에서는 고객사를 고칠 수 있고, 비우면 저장이 막히며, 고쳐도 상태 이력은 늘지 않음
 * C3  완료·취소된 주문은 화면에 수정 폼이 없고, 직접 요청해도 서버가 400 으로 거절함
 * C4  100자까지만 입력되고, 101자를 직접 요청하면 서버가 400 으로 거절함
 *
 * 기존 스펙은 고객사를 다루지 않으므로 새 파일로 둔다. 서버 규칙은 JUnit(ServiceBehaviorTest, WebBehaviorTest)에도 있다.
 * 필수화 이전에 확정된 주문(고객사 null)의 '-' 표시와 처음 채우기는 화면으로 그런 주문을 만들 수 없으므로
 * E2E 가 아니라 JUnit(ServiceBehaviorTest, WebBehaviorTest 의 legacyOrderWithoutCustomer...)에서 검증한다.
 * 전제  앱이 http://localhost:8080 에서 실행 중 (BASE_URL 로 변경 가능).
 *       주문은 취소해도 남으므로 인메모리 DB 로 새로 띄운 서버에서 실행한다 (playwright.config.ts 설명 참고).
 *       시나리오가 만든 주문은 끝에서 취소로 정리하며, 완료 주문(C3)은 최종 상태라 남는다.
 */

/** 주문 추가 화면에서 고객사를 넣고 확정한다. 확정되면 상세로 이동하며 주문 번호를 돌려준다. */
async function createOrderWithCustomer(page: Page, customerName: string): Promise<number> {
  await page.goto('/orders/new');
  await page.locator('#runBtn').click();
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#customerName').fill(customerName);
  await page.locator('#confirmBtn').click();
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  await expect(page.locator('#content')).toBeVisible();
  return Number(new URL(page.url()).pathname.split('/').pop());
}

/** 상세 화면 위쪽 정보의 '고객사' 값 */
const customerValue = (page: Page) =>
  page.locator('dl.meta > div', { has: page.locator('dt', { hasText: '고객사' }) }).locator('dd');

/** 고객사 입력칸에 값을 넣고 저장한다. */
async function saveCustomer(page: Page, name: string): Promise<void> {
  await page.locator('#customerInput').fill(name);
  await page.locator('.customer-form button').click();
}

const LOCKED_MESSAGE = '완료 또는 취소된 주문은 고객사를 수정할 수 없습니다.';

/** API 로 상세를 읽어 현재 version 을 얻는다. */
async function currentVersion(page: Page, id: number): Promise<number> {
  const res = await page.request.get(`/api/orders/${id}`);
  expect(res.status()).toBe(200);
  return (await res.json()).version as number;
}

test.describe('고객사 입력·수정', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('C1 확정 때 입력한 고객사가 상세에 보이고, 입력하지 않으면 확정이 거절됨', async ({ page }) => {
    const ids: number[] = [];
    try {
      ids.push(await createOrderWithCustomer(page, '  ㈜한빛 배터리  '));
      await expect(customerValue(page)).toHaveText('㈜한빛 배터리'); // 앞뒤 공백은 저장하지 않는다

      // 입력하지 않으면(비움, 공백만) 확정 버튼이 막히고 안내가 보이며, 입력칸에는 필수 표시가 있다
      await page.goto('/orders/new');
      await page.locator('#runBtn').click();
      await expect(page.locator('#result')).toBeVisible();
      const input = page.locator('#customerName');
      await expect(input).toHaveAttribute('required', '');
      for (const blank of ['', '   ']) {
        await input.fill(blank);
        await expect(page.locator('#confirmBtn')).toBeDisabled();
        await expect(page.locator('#customerHint')).toBeVisible();
      }
      await input.fill('입력함');
      await expect(page.locator('#confirmBtn')).toBeEnabled();
      await expect(page.locator('#customerHint')).toBeHidden();

      // 화면을 우회해도 서버가 400 으로 거절하고 주문은 늘지 않는다
      const before = await orderTotalCount(page);
      const version = (await (await page.request.get('/api/master')).json()).version as number;
      for (const customerName of [undefined, null, '   ']) {
        const res = await page.request.post('/api/orders', {
          data: { orders: DEFAULT_ORDERS, routeType: 'COST', masterVersion: version, customerName },
        });
        expect(res.status()).toBe(400);
        expect((await res.json()).error).toBe('고객사를 입력하세요');
      }
      expect(await orderTotalCount(page)).toBe(before);
    } finally {
      for (const id of ids) await cancelOrderIfOpen(page, id);
    }
  });

  test('C2 확정·진행 상태에서 고객사를 고칠 수 있고, 고쳐도 상태 이력은 늘지 않음', async ({ page }) => {
    const id = await createOrderWithCustomer(page, '한빛');
    try {
      const history = page.locator('#history tr');
      await expect(history).toHaveCount(1); // 확정 1건

      // 확정 상태에서 수정
      await saveCustomer(page, '새한 에너지');
      await expect(page.locator('#flash .alert.ok')).toHaveText('고객사를 저장했습니다');
      await expect(customerValue(page)).toHaveText('새한 에너지');
      await expect(page.locator('#customerInput')).toHaveValue('새한 에너지');

      // 진행 상태에서도 수정 (상태를 바꾸면 version 이 달라지므로 화면이 새 값을 쓰는지도 함께 확인된다)
      await changeStatus(page, '진행');
      await expect(page.locator('#title .badge')).toHaveText('진행');
      await saveCustomer(page, '대한 모빌리티');
      await expect(page.locator('#flash .alert.ok')).toHaveText('고객사를 저장했습니다');
      await expect(customerValue(page)).toHaveText('대한 모빌리티');

      // 비우거나 공백만 넣으면 저장 버튼이 막히고 안내가 보이며, 서버도 400 으로 거절한다
      const input = page.locator('#customerInput');
      await expect(input).toHaveAttribute('required', '');
      for (const blank of ['', '   ']) {
        await input.fill(blank);
        await expect(page.locator('.customer-form button')).toBeDisabled();
        await expect(page.locator('#customerHint')).toBeVisible();
      }
      const rejected = await page.request.post(`/api/orders/${id}/customer`, {
        data: { customerName: '  ', version: await currentVersion(page, id) },
      });
      expect(rejected.status()).toBe(400);
      expect((await rejected.json()).error).toBe('고객사를 입력하세요');
      await page.goto(`/orders/${id}`);
      await expect(customerValue(page)).toHaveText('대한 모빌리티'); // 값은 그대로

      // 이력은 확정, 진행 2건 그대로 (고객사 수정은 이력을 남기지 않는다)
      await expect(history).toHaveCount(2);

      // 새로 열어도 마지막 값이 저장되어 있다
      await saveCustomer(page, '최종 고객사');
      await expect(customerValue(page)).toHaveText('최종 고객사');
      await page.goto(`/orders/${id}`);
      await expect(customerValue(page)).toHaveText('최종 고객사');
    } finally {
      await cancelOrderIfOpen(page, id);
    }
  });

  test('C3 완료·취소된 주문은 화면에서 수정할 수 없고 서버도 거절함', async ({ page }) => {
    // 완료
    const completedId = await createOrderWithCustomer(page, '완료 고객사');
    await changeStatus(page, '진행');
    await expect(page.locator('#title .badge')).toHaveText('진행');
    await changeStatus(page, '완료');
    await expect(page.locator('#title .badge')).toHaveText('완료');
    await expect(page.locator('#customerInput')).toHaveCount(0);
    await expect(page.locator('.customer-form')).toHaveCount(0);
    await expect(page.getByText(LOCKED_MESSAGE)).toBeVisible();
    await expect(customerValue(page)).toHaveText('완료 고객사'); // 값은 계속 보인다

    const completed = await page.request.post(`/api/orders/${completedId}/customer`, {
      data: { customerName: '우회 수정', version: await currentVersion(page, completedId) },
    });
    expect(completed.status()).toBe(400);
    expect((await completed.json()).error).toBe('완료 상태의 주문은 고객사를 수정할 수 없습니다');

    // 취소
    const canceledId = await createOrderWithCustomer(page, '취소 고객사');
    await changeStatus(page, '취소');
    await expect(page.locator('#title .badge')).toHaveText('취소');
    await expect(page.locator('#customerInput')).toHaveCount(0);
    await expect(page.getByText(LOCKED_MESSAGE)).toBeVisible();

    const canceled = await page.request.post(`/api/orders/${canceledId}/customer`, {
      data: { customerName: '우회 수정', version: await currentVersion(page, canceledId) },
    });
    expect(canceled.status()).toBe(400);
    expect((await canceled.json()).error).toBe('취소 상태의 주문은 고객사를 수정할 수 없습니다');

    // 거절된 뒤에도 값은 그대로다
    for (const [id, name] of [[completedId, '완료 고객사'], [canceledId, '취소 고객사']] as const) {
      const body = await (await page.request.get(`/api/orders/${id}`)).json();
      expect(body.customerName).toBe(name);
      expect(body.customerEditable).toBe(false);
    }
  });

  test('C4 고객사는 100자까지만 입력되고, 101자 요청은 서버가 거절함', async ({ page }) => {
    const id = await createOrderWithCustomer(page, '처음 고객사');
    try {
      // 화면: 입력칸이 100자에서 멈춘다
      const input = page.locator('#customerInput');
      await expect(input).toHaveAttribute('maxlength', '100');
      await input.fill('가'.repeat(100));
      await input.pressSequentially('나다');
      expect((await input.inputValue()).length).toBe(100);
      await page.locator('.customer-form button').click();
      await expect(page.locator('#flash .alert.ok')).toHaveText('고객사를 저장했습니다');
      await expect(customerValue(page)).toHaveText('가'.repeat(100));

      // 우회 요청: 101자는 400 이고 값은 바뀌지 않는다
      const res = await page.request.post(`/api/orders/${id}/customer`, {
        data: { customerName: '가'.repeat(101), version: await currentVersion(page, id) },
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe('고객사는 100자 이하로 입력하세요');
      const body = await (await page.request.get(`/api/orders/${id}`)).json();
      expect(body.customerName).toBe('가'.repeat(100));
    } finally {
      await cancelOrderIfOpen(page, id);
    }
  });
});
