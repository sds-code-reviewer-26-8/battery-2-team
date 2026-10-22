import { test, expect, type Page } from '@playwright/test';
import { cancelOrderIfOpen, createOrder, login } from './helpers';

/**
 * 회원가입 시나리오 (feature-sy9169-signup)
 *
 * G1  가입 → 로그인 → 주문 목록 (로그인 화면의 링크로 가입 화면에 들어간다)
 * G2  입력이 틀리면 이유를 모두 알리고, 입력한 값은 그대로 둔다
 * G3  이미 있는 아이디(대소문자만 달라도)는 거절한다
 * G4  가입 코드가 틀리면 거절하고, 계정이 만들어지지 않는다
 * G5  이미 로그인한 사람이 가입 화면을 열면 주문 목록으로 보낸다
 * G6  가입한 회원이 만든 주문에는 그 회원의 아이디가 작성자·변경한 사람으로 남는다
 * G7  기존 admin 계정은 그대로 로그인된다 (회귀)
 *
 * - 가입한 계정은 지울 수 없어 실행할 때마다 쌓이므로, 아이디는 실행마다 새로 만든다.
 *   E2E 는 인메모리 DB 서버에서 실행한다(playwright.config.ts 설명 참고).
 * - 가입 코드는 서버 설정(app.signup.code)이며 기본값은 'signup' 이다. 다르게 띄웠다면 환경변수 SIGNUP_CODE 로 알려 준다.
 */
const CODE = process.env.SIGNUP_CODE ?? 'signup';
const PASSWORD = 'pass1234';

/** 4~20자 소문자·숫자 아이디. 실행마다 다르다. */
const newUsername = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function fillSignup(page: Page, v: { username: string; password: string; confirm?: string; code?: string }): Promise<void> {
  await page.locator('input[name="username"]').fill(v.username);
  await page.locator('input[name="password"]').fill(v.password);
  await page.locator('input[name="passwordConfirm"]').fill(v.confirm ?? v.password);
  await page.locator('input[name="code"]').fill(v.code ?? CODE);
}

const submitSignup = (page: Page) => page.getByRole('button', { name: '가입', exact: true }).click();

/** 가입 화면을 열어 가입한다. 성공하면 로그인 화면으로 이동한다. */
async function signUp(page: Page, username: string): Promise<void> {
  await page.goto('/signup');
  await fillSignup(page, { username, password: PASSWORD });
  await submitSignup(page);
  await expect(page).toHaveURL(/\/login\?signedUp=1$/);
}

async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test.describe('회원가입', () => {
  test('G1 가입 → 로그인 → 주문 목록', async ({ page }) => {
    const username = newUsername();

    // 로그인 화면의 링크로 가입 화면에 들어간다
    await page.goto('/login');
    await page.getByRole('link', { name: '회원가입' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { name: '회원가입' })).toBeVisible();

    await fillSignup(page, { username, password: PASSWORD });
    await submitSignup(page);

    // 가입하면 자동 로그인 없이 로그인 화면으로 이동하고 안내가 보인다
    await expect(page).toHaveURL(/\/login\?signedUp=1$/);
    await expect(page.locator('.alert.ok')).toHaveText('가입했습니다. 로그인해 주세요');
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login$/); // 가입했다고 로그인된 것은 아니다

    // 가입한 계정으로 로그인
    await loginAs(page, username, PASSWORD);
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
    await expect(page.locator('header .user')).toContainText(username);
  });

  test('G2 입력이 틀리면 이유를 모두 알리고 입력한 값은 그대로 둔다', async ({ page }) => {
    await page.goto('/signup');
    const username = 'ab';
    await fillSignup(page, { username, password: 'short', confirm: 'different', code: 'wrong-code' });
    // 아이디 4자 미만은 브라우저 검증(minlength)이 먼저 막으므로, 서버 검증을 보려고 검증을 끄고 보낸다
    await page.locator('#signupForm').evaluate((f: HTMLFormElement) => f.setAttribute('novalidate', ''));
    await submitSignup(page);

    const reasons = page.locator('.alert.error li');
    await expect(reasons).toHaveText([
      '아이디는 4자 이상 20자 이하여야 합니다',
      '비밀번호는 8자 이상이어야 합니다',
      '비밀번호 확인이 일치하지 않습니다',
      '가입 코드가 올바르지 않습니다',
    ]);
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.locator('input[name="username"]')).toHaveValue(username);

    // 허용되지 않는 글자
    await page.locator('input[name="username"]').fill('한글 아이디!');
    await fillSignup(page, { username: '한글 아이디!', password: PASSWORD });
    await submitSignup(page);
    await expect(page.locator('.alert.error li')).toContainText(['아이디는 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다']);

    // 고쳐서 다시 보내면 가입된다
    await fillSignup(page, { username: newUsername(), password: PASSWORD });
    await submitSignup(page);
    await expect(page).toHaveURL(/\/login\?signedUp=1$/);
  });

  test('G3 이미 있는 아이디는 거절한다 (대소문자만 달라도)', async ({ page }) => {
    const username = newUsername();
    await signUp(page, username);

    for (const again of [username, username.toUpperCase()]) {
      await page.goto('/signup');
      await fillSignup(page, { username: again, password: PASSWORD });
      await submitSignup(page);
      await expect(page.locator('.alert.error li')).toHaveText(['이미 사용 중인 아이디입니다']);
      await expect(page).toHaveURL(/\/signup$/);
    }
    // admin 은 이미 있는 아이디다
    await page.goto('/signup');
    await fillSignup(page, { username: 'admin', password: PASSWORD });
    await submitSignup(page);
    await expect(page.locator('.alert.error li')).toHaveText(['이미 사용 중인 아이디입니다']);
  });

  test('G4 가입 코드가 틀리면 거절하고 계정이 만들어지지 않는다', async ({ page }) => {
    const username = newUsername();
    await page.goto('/signup');
    await fillSignup(page, { username, password: PASSWORD, code: 'wrong-code' });
    await submitSignup(page);
    await expect(page.locator('.alert.error li')).toHaveText(['가입 코드가 올바르지 않습니다']);
    await expect(page).toHaveURL(/\/signup$/);

    // 그 아이디로는 로그인할 수 없다
    await page.goto('/login');
    await loginAs(page, username, PASSWORD);
    await expect(page.locator('.alert.error')).toHaveText('아이디 또는 비밀번호가 올바르지 않습니다');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('G5 이미 로그인한 사람이 가입 화면을 열면 주문 목록으로 보낸다', async ({ page }) => {
    await login(page);
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('G6 가입한 회원이 만든 주문에는 그 회원의 아이디가 남는다', async ({ page }) => {
    const username = newUsername();
    await signUp(page, username);
    await loginAs(page, username, PASSWORD);
    await expect(page).toHaveURL(/\/orders$/);

    const id = await createOrder(page); // 주문 상세로 이동한다
    try {
      await expect(page.locator('#meta')).toContainText(username); // 작성자
      await expect(page.locator('#history tr').first().locator('td').nth(3)).toHaveText(username); // 변경한 사람

      await page.goto('/orders');
      await expect(page.locator(`tr.clickable:has(a[href="/orders/${id}"])`)).toContainText(username);
    } finally {
      await cancelOrderIfOpen(page, id);
    }
  });

  test('G7 기존 admin 계정은 그대로 로그인된다', async ({ page }) => {
    await login(page);
    await expect(page.locator('header .user')).toContainText('admin');
  });
});
