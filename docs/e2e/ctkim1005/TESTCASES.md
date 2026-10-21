# E2E 테스트 케이스

- 도구: Playwright (`npm run test:e2e`, UI 모드 `npx playwright test --ui`)
- 전제: 앱이 `http://localhost:8080` 에서 실행 중 (`.\gradlew.bat bootRun`)
- 코드: `src/test/e2e/*.spec.ts` (No.와 코드의 TC ID가 1:1로 대응)
- 명세: `docs/e2e/ctkim1005/TESTCASES.md` (이 문서)

| No. | 영역 | 시나리오 | 절차 | 목적 | 예상시간 | Pass 조건 | 담당자 |
|---|---|---|---|---|---|---|---|
| TC-E2E-001 | 로그인 / 접근 통제 | 로그인 → 주문 목록 → 로그아웃 | 1. 로그인 없이 홈(`/`) 접속<br>2. 아이디 `admin`, 비밀번호 `admin` 입력 후 [로그인] 클릭<br>3. 주문 목록 화면 확인<br>4. [로그아웃] 클릭<br>5. 로그아웃 상태로 `/orders` 재접속 | 로그인한 사용자만 화면을 쓸 수 있다는 기본 접근 통제가 처음부터 끝까지 동작하는지 확인 (통합 PRD F1, INTENT G8) | 10초 | 1. `/login`으로 이동하고 "배터리 주문 관리" 제목이 보임<br>3. URL이 `/orders`, "주문 목록" 제목, 메뉴 "주문 추가"·"마스터 데이터", 사용자명 `admin` 표시<br>4. `/login`으로 돌아감<br>5. 다시 `/login`으로 막힘 | |
