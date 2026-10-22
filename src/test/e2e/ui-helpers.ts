import { expect, type Locator, type Page } from '@playwright/test';

/** 주문 추가 화면의 공장 순서 (왼쪽 → 오른쪽). 게이지는 오른쪽 나라와 짝으로 움직인다. */
export const FACTORIES = ['CHINA', 'JAPAN', 'VIETNAM', 'INDONESIA'] as const;

/** number 입력칸에 값을 넣고 change 이벤트까지 일으킨다. (change 는 입력칸을 벗어날 때 발생하는 이벤트) */
export async function setNumber(input: Locator, value: string | number): Promise<void> {
  await input.fill(String(value));
  await input.dispatchEvent('change');
}

/**
 * 주문 추가 화면을 열고, 화면이 기준값(/api/master)을 불러와 게이지를 다시 그릴 때까지 기다린다.
 * 이 전에 입력하면 늦게 도착한 갱신이 입력값을 되돌려, 서버를 막 띄운 직후에 가끔 실패한다.
 */
export async function openOrderForm(page: Page): Promise<void> {
  const masterLoaded = page.waitForResponse(res => new URL(res.url()).pathname === '/api/master');
  await page.goto('/orders/new');
  await masterLoaded;
  // 기준값이 반영되면 수량이 있는 나라의 게이지 아래에 "방문 N회"(N ≥ 1)가 표시된다.
  await expect(page.locator('.gauge[data-c="CHINA"] .gvisits')).not.toHaveText('방문 0회');
}

/** 주문 추가 화면의 나라별 수량 입력칸 */
export const gaugeInput = (page: Page, country: (typeof FACTORIES)[number]): Locator =>
  page.locator(`.gauge[data-c="${country}"] .gnum`);

/** 나라별 수량 4개를 [중국, 일본, 베트남, 인도네시아] 순서로 읽는다. */
export async function gaugeValues(page: Page): Promise<number[]> {
  const values: number[] = [];
  for (const country of FACTORIES) {
    values.push(Number(await gaugeInput(page, country).inputValue()));
  }
  return values;
}

/** 주문 추가 화면을 열고 시뮬레이션을 실행한 뒤 결과가 보일 때까지 기다린다. */
export async function runSimulation(page: Page): Promise<void> {
  await page.locator('#runBtn').click();
  await expect(page.locator('#result')).toBeVisible();
}

/** 확인창(confirm)을 수락하면서 상태 변경 버튼을 누른다. 예) changeStatus(page, '진행') */
export async function changeStatus(page: Page, label: '진행' | '완료' | '취소'): Promise<void> {
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `${label}(으)로 변경` }).click();
}

/**
 * 마스터 데이터 화면의 입력값 전체를 {입력칸 이름: 값} 으로 읽는다.
 * 기준값을 바꾸는 테스트가 끝에서 원래 값으로 되돌릴 때 쓴다.
 */
export async function readMasterForm(page: Page): Promise<Record<string, string>> {
  await page.goto('/master');
  // 화면은 입력칸을 /api/master/form 응답으로 그리므로, 그려질 때까지 기다린 뒤 읽는다
  await page.locator('form[action$="/master"] input[name="shipCount"]').waitFor();
  return page.locator('form[action$="/master"] input[name]').evaluateAll(inputs =>
    Object.fromEntries((inputs as HTMLInputElement[]).map(input => [input.name, input.value])),
  );
}

/** 마스터 데이터를 저장한다. form 은 readMasterForm 결과에 바꿀 값만 덮어쓴 것이다. */
export async function saveMasterForm(page: Page, form: Record<string, string>): Promise<void> {
  const res = await page.request.post('/api/master', { data: form });
  expect(res.ok(), '마스터 데이터 저장 요청이 성공해야 함').toBeTruthy();
}
