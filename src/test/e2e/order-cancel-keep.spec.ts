import { expect, test } from '@playwright/test';
import { chipCount, createOrder, login, orderVersion } from './helpers';

// 취소해도 주문은 삭제되지 않고 '취소' 상태로 남는다. 사유는 선택(최대 200자)이다.

test('취소하면 주문이 보존되고 최종 상태 문구·사유가 보이며 취소 칩이 늘어난다', async ({ page }) => {
  await login(page);
  await page.goto('/orders');
  const before = await chipCount(page, '취소');
  const id = await createOrder(page);

  page.once('dialog', (d) => d.accept());
  await page.locator('form.status-form input[name="reason"]').fill('재고 부족');
  await page.getByRole('button', { name: '취소(으)로 변경' }).click();

  await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
  await expect(page.locator('.muted', { hasText: '최종 상태라 더 바꿀 수 없습니다.' })).toBeVisible();
  await expect(page.locator('#cancelReason')).toHaveText('재고 부족');

  await page.goto('/orders');
  expect(await chipCount(page, '취소')).toBe(before + 1);
  await page.locator('.filters a.chip', { hasText: '취소' }).first().click();
  await expect(page.locator(`a[href$="/orders/${id}"]`).first()).toBeVisible();
});

test('201자 사유는 거부되고 200자 사유는 저장된다', async ({ page }) => {
  await login(page);
  const id = await createOrder(page);
  let version = await orderVersion(page, id);

  // 리다이렉트를 따라가면 응답 본문이 오류 알림이 있는 주문 상세 화면이다
  const rejected = await page.request.post(`/orders/${id}/status`, {
    form: { status: 'CANCELED', version: String(version), reason: 'a'.repeat(201) },
  });
  expect(await rejected.text()).toContain('취소 사유는 200자까지 입력할 수 있습니다');
  version = await orderVersion(page, id); // 확정 유지(폼이 남아 있음)

  await page.request.post(`/orders/${id}/status`, {
    form: { status: 'CANCELED', version: String(version), reason: 'a'.repeat(200) },
  });
  await page.goto(`/orders/${id}`);
  await expect(page.locator('#cancelReason')).toHaveText('a'.repeat(200));
});

test('취소 버튼 확인창 문구가 유지된다', async ({ page }) => {
  await login(page);
  const id = await createOrder(page);
  let message = '';
  page.once('dialog', async (d) => {
    message = d.message();
    await d.dismiss();
  });
  await page.getByRole('button', { name: '취소(으)로 변경' }).click();
  expect(message).toBe('취소(으)로 바꿉니다. 계속할까요?');
  await expect(page.locator('form.status-form input[name="version"]').first()).toBeAttached();
  expect(id).toBeGreaterThan(0);
});
