# ctkim1005 구현 Loop 설계 (README)

작성일: 2026-10-21 · 구현 방식: Claude Code Dynamic Workflow (`loop/impl-loop.js`) + Subagent 3개 (`agents/`)

> **산출물 양식**: 구현 전 `precheck.html`과 구현 후 `report.html`은 팀 공용 템플릿(`docs/templates/`, PR #15)을 그대로 쓴다. 데이터 키와 작성법은 [`docs/templates/README.md`](../../templates/README.md)를 따르며, `loop/render.mjs`가 그 키가 빠지면 HTML을 만들지 않도록 강제한다.

## 1. 한 줄 요약

요청 하나를 **문서 규칙 대조 → 사전 점검 → 구현 → 보안·아키텍처 점검 → 검증** 여섯 에이전트가 처리하고, 검증이 FAIL이면 피드백을 들고 규칙 대조부터 되돌아간다. 라운드마다 팀 템플릿으로 `precheck.html`과 `report.html`을 남기며, PASS가 나오거나 최대 3라운드를 넘기면 멈춘다.

```
            ┌──────────────────────────────────────────────────────────────┐
            │                                                              │ FAIL → plan_feedback
   요청 ──▶ 규칙 대조 ──▶ 사전 점검 ──READY──▶ 구현 ──▶ ┌ 보안 점검   ┐ ──▶ 검증 ──PASS──▶ END
            │              │ precheck.html          └ 아키텍처 점검 ┘     report.html  │
            │              └──HILP──▶ 사람에게 질문 (멈춤)                              ◀┘
            └ CONFLICT ─▶ 사전 점검이 HILP 로 전환
```

v1(2026-10-21 1라운드 실행본)은 사전 점검·구현·검증 세 단계였고, v2에서 규칙 대조·보안·아키텍처 점검을 더했다.

## 2. 구현 전에 자동으로 하는 일

### 2-1. 문서 규칙 대조 에이전트 (v2 추가)

| 순서 | 자동 수행 | 결과가 가는 곳 |
|---|---|---|
| 1 | 팀 PRD §4 F1~F12·§5·§6·§7 D1~D6·§9·§10 쟁점, INTENT §2 I1~I9·§4 G1~G8·§6·§7 미결을 읽음 | |
| 2 | 요청을 항목별로 대조해 **충돌**(어기게 되는 규칙), **미결 의존**(팀이 아직 정하지 않은 것), **뒷받침 규칙**으로 분류 | `conflicts`, `unresolved`, `supports` |
| 3 | 판정 OK / CONFLICT / UNRESOLVED | 사전 점검에 전달 |

CONFLICT면 사전 점검이 HILP로 전환하고 충돌 항목을 질문으로 바꾼다. UNRESOLVED면 요청이 그 결정을 스스로 내리는지 판단해 READY/HILP를 정한다. 충돌·미결 항목은 모두 precheck의 `risk.items`에 들어간다.

### 2-2. 사전 점검 에이전트

| 순서 | 자동 수행 | 결과가 가는 곳 |
|---|---|---|
| 1 | `git status`, 8080 포트 확인 (앱이 꺼져 있으면 HILP) | `status`, `reason` |
| 2 | 팀 PRD/INTENT에서 요청과 관련된 조항을 찾아 근거 인용 | `background`, `purpose` |
| 3 | 관련 코드를 읽고 현재 동작을 curl로 재현 | `background.evidence` |
| 4 | 변경 규모·심각도·영향 범위 평가 | `risk` |
| 5 | 기존 테스트 중 이 변경을 검증하는 것과 새로 추가할 테스트 정리 | `testCases` |
| 6 | 구현 후 꼭 확인할 체크리스트 3개 작성 | `checklist` |
| 7 | 파일 단위 구현 계획 | `plan` |
| 8 | HILP 판정: 배경이나 목적을 이해하지 못함 / 큰 변경·높은 위험을 User가 모름(경고) / 팀 문서와 충돌 / 사람이 정해야 할 선택 → `HILP`로 멈추고 질문 작성 | `status`, `reason`, `questions`, `risk.warning` |
| 9 | 점검 내용을 `docs/logs/prepare/inspection_{날짜_시간_초}.log`에 저장 (로컬 기록, gitignore) | 로그 파일 |
| 10 | `precheck.json` 저장 → `render.mjs`로 `precheck.html` 생성 | `round-N/precheck.html` |

## 3. 구현 (구현 에이전트)

- 사전 점검의 `plan`대로 `src/main` 최소 변경, `/api/*` JSON 오류 응답은 불변.
- `OrderFlowTests`에 MockMvc 테스트 추가, `./gradlew.bat test` 전부 통과할 때까지 수정 (최대 3회).
- 실행 중인 앱에 반영됐는지 curl로 확인하고, 반영이 안 됐으면 앱을 재시작.
- commit은 하지 않는다 (사람이 리포트를 보고 결정).

## 4. 구현 후에 자동으로 하는 일

### 4-1. 보안 점검 에이전트 (v2 추가, 아키텍처 점검과 동시 실행)

변경분(`git diff` + 신규 파일)만 보고 다음을 점검한다: 접근 통제 우회(LoginInterceptor 범위), 입력 검증·XSS(`th:text`만 허용), 오류 응답의 내부 정보 노출(curl로 실제 본문 확인), 상태 코드 의미, API 상태 코드 불변, 동시성 version 검사 약화, 빌드·설정 변경 영향. 결과는 `findings[{severity, location, problem, reproduce}]`로, 재현 방법이 없는 추측은 넣지 않는다.

### 4-2. 아키텍처 점검 에이전트 (v2 추가)

Understand 그래프의 계층 정의를 기준으로 점검한다: 패키지 의존 방향(controller → service → repository/simulation → entity, 역방향 금지), 컨트롤러의 책임 범위, 공통 조각·헬퍼 재사용, 코드 관례, 다른 계층의 공개 계약 유지. 결과는 `violations[]`와 `layersOk`.

### 4-3. 검증 에이전트

| 순서 | 자동 수행 | 결과가 가는 곳 |
|---|---|---|
| 1 | 앱 반영 확인 (curl, 로그인 세션) | `checklist[].evidence` |
| 2 | JUnit 전체 실행, `build/test-results` XML에서 테스트 단위 결과 수집 | `regression` |
| 3 | Playwright E2E 전체 실행, 실패 건은 코드의 `known-issue` 표시 여부로 허용/불허 구분 | `e2e`, `issues` |
| 4 | 체크리스트 3개를 pass / fail / unverified로 판정 | `checklist[].result` |
| 5 | 보안·아키텍처 결과를 `issues`에 옮김. 보안 blocker 또는 아키텍처 blocker/major는 FAIL 사유 | `issues` |
| 6 | 판정: 체크리스트 전부 pass + JUnit 실패 0 + 대상 E2E 통과 + 그 외 실패는 known-issue뿐 + 보안 blocker 없음 + 아키텍처 blocker/major 없음 → `PASS/END`, 아니면 `FAIL/RETRY` | `verdict`, `loop_action` |
| 7 | FAIL이면 prepare로 돌아가기 위한 값 작성 (보안·아키텍처 지적은 `suggested_focus`) | `plan_feedback`, `loop_action=RETRY` |
| 7-1 | 점검·피드백 내용을 `docs/logs/verify/review_{날짜_시간_초}.log`에 저장 (로컬 기록, gitignore) | 리뷰 로그 |
| 8 | `report.json` 저장 → `render.mjs`로 `report.html` 생성 (`precheck_link`로 연결) | `round-N/report.html` |

## 5. 종료 조건

| 결과 | 동작 |
|---|---|
| PASS | verify가 prepare/implement/verify가 한 일을 짧게 정리한 최종 리포트(`docs/logs/reports/report_*.HTML`)를 만들고, 최종 `precheck.html`·`report.html`을 작업 폴더 루트에 복사한 뒤 Loop 종료. 사람이 확인하고 commit·PR |
| FAIL, 라운드 < 3 | `plan_feedback`을 들고 라운드+1에서 규칙 대조부터 다시 |
| FAIL, 라운드 = 3 | Loop 종료, 마지막 리포트와 피드백을 사람에게 넘김 |
| HILP | 즉시 종료, 질문을 사람에게 넘김 |

## 6. 산출물 경로

```
docs/loops/ctkim1005/                   ← Loop 설계와 도구 (이 폴더)
├── README.md                           ← 이 문서 (설계 설명)
├── command/impl-loop/SKILL.md          ← 나만의 명령어 /impl-loop 정의 (.claude/skills/ 에 복사해 사용)
├── agents/                             ← Subagent 정의 3개 (.claude/agents/ 에 복사해 사용)
│   ├── prepare.md                      ← 구현 전: 문서 규칙 대조 + 사전 점검
│   ├── implement.md                    ← 구현: 코드 수정 + 테스트 추가 + JUnit + 앱 반영
│   └── verify.md                       ← 구현 후: 보안 점검 + 아키텍처 점검 + 검증·리포트
└── loop/
    ├── impl-loop.js                    ← 이름 있는 Dynamic Workflow (.claude/workflows/impl-loop.js 에 복사해 사용)
    ├── render.mjs                      ← 템플릿 + JSON → HTML 렌더 (precheck / report / summary)
    └── summary-report.template.html    ← PASS 종료 시 최종 리포트 템플릿 (docs/logs/reports/report_*.HTML)

docs/logs/ (gitignore, 로컬 기록)
├── prepare/inspection_{날짜_시간_초}.log   ← prepare 점검 로그
├── verify/review_{날짜_시간_초}.log        ← verify 점검·피드백 로그
└── reports/report_{날짜_시간_초}.HTML      ← PASS 시 prepare/implement/verify 가 한 일을 정리한 최종 리포트

docs/evidence/ctkim1005/                ← Loop 가 만든 산출물 (작업별)
└── TASK-NNN-<작업명>/
    ├── precheck.html                   ← 최종 라운드 사전 점검 (필수 산출물)
    ├── report.html                     ← 최종 라운드 검증 리포트 (필수 산출물)
    └── round-N/
        ├── precheck.json, precheck.html
        └── report.json, report.html
```

## 7. 실행 방법

### 7-1. 나만의 명령어 `/impl-loop` (권장)

`command/impl-loop/SKILL.md`가 명령어 정의다. 로컬 `.claude/skills/impl-loop/`에 복사하면 Claude Code에서 다음 한 줄로 Loop 전체가 돈다.

```
/impl-loop 없는 주문 번호를 열면 500 대신 안내 페이지를 보여 준다
```

명령어는 작업 번호(`TASK-NNN-이름`)를 정하고, branch·앱을 확인하고, 소스를 훑어 Loop 인자(관련 코드·테스트·대상 테스트·시나리오)를 채운 뒤 아래 Workflow를 호출한다. 끝나면 최종 `precheck.html`·`report.html`을 작업 폴더 루트에 복사하고 결과를 요약한다. commit·push·PR은 사람이 한다.

### 7-2. Workflow 직접 호출

`.claude/workflows/impl-loop.js`가 이름 있는 Dynamic Workflow다 (원본 `loop/impl-loop.js`). 인자는 구현할 내용 한 줄이며, 작업 번호·관련 코드·테스트·시나리오는 첫 단계(prepare의 사전 조사)가 스스로 정한다.

```
Workflow({ name: "impl-loop", args: "<구현할 내용>" })
Workflow({ name: "impl-loop", args: { request: "<구현할 내용>", task: "TASK-003-cancel-keeps-order", maxRounds: 3 } })
```

전제: 앱이 `http://localhost:8080`에서 실행 중, 작업 branch에서 시작, `.claude/agents/`에 prepare·implement·verify가 설치되어 있음.

Subagent 호출 순서와 Loop 규칙:

| 규칙 | 구현 |
|---|---|
| 호출 순서 | prepare(사전 조사 → 규칙 대조 → 사전 점검) → implement → verify(보안 ∥ 아키텍처 → 검증) |
| Feedback Loop | verify가 FAIL이면 `plan_feedback`을 들고 다음 라운드의 prepare(규칙 대조)로 돌아간다. 최대 3라운드 |
| Human-in-the-loop | prepare가 HILP를 요청하면 Loop를 종료하고 질문을 사람에게 넘긴다 |

실행 이력:

| 작업 | Loop 버전 | 결과 | 산출물 |
|---|---|---|---|
| TASK-001-order-not-found | v1 (3단계) | 1라운드 PASS | `TASK-001-order-not-found/` |
| TASK-002-broken-request-trace | v2 (6단계) | 1라운드 PASS (규칙 OK, 보안 minor 2, 아키텍처 minor 1) | `TASK-002-broken-request-trace/` |

전제: 앱이 `http://localhost:8080`에서 실행 중, 작업 branch에서 시작.

## 8. Subagent 구성

| Subagent | 정의 파일 | Workflow에서 맡는 단계 |
|---|---|---|
| `prepare` | `agents/prepare.md` | 사전 조사(첫 라운드), 문서 규칙 대조, 사전 점검 (호출 프롬프트가 0/A/B 역할을 지정) |
| `implement` | `agents/implement.md` | 구현 |
| `verify` | `agents/verify.md` | 보안 점검, 아키텍처 점검, 검증·리포트 (호출 프롬프트가 A/B/C 역할을 지정) |

역할·제약(코드 수정 금지, 다른 팀원 파일 보호, PASS 기준)은 agent 정의 파일에 두고, 작업별 정보(요청, 관련 코드·테스트, 산출물 경로)는 Workflow가 호출 프롬프트로 넘긴다. `.claude/` 는 팀 규칙상 commit 하지 않으므로 원본은 이 폴더에 두고 복사해 쓴다.

```powershell
Copy-Item docs\loops\ctkim1005\agents\*.md .claude\agents\
Copy-Item docs\loops\ctkim1005\loop\impl-loop.js .claude\workflows\
Copy-Item -Recurse -Force docs\loops\ctkim1005\command\impl-loop .claude\skills\impl-loop
```

## 9. 설계에서 의도한 점

- **사람이 끼어드는 자리를 명시**: 사전 점검의 `HILP`와 Loop 종료 시 commit을 사람에게 남겨, 자동화가 팀 결정(예: PRD §10 미결 사항)을 대신 내리지 않게 했다.
- **증거 우선**: 모든 판정은 명령과 결과(`evidence`, `commands`)를 함께 남겨 리포트만 보고도 재현할 수 있다.
- **결정적 렌더**: HTML은 에이전트가 직접 쓰지 않고 `render.mjs`가 팀 템플릿에 JSON을 끼워 만들므로, 팀원 산출물과 디자인이 같고 필수 키가 빠지면 실패한다.
- **구현 전후 점검을 분리**: 규칙 대조·보안·아키텍처는 각각 별도 에이전트가 맡아 판정 근거가 섞이지 않는다. 보안과 아키텍처는 diff만 보므로 동시에 돌려 라운드당 추가 시간을 1~2분으로 줄였다.
- **첫 대상은 작은 결함**: 팀 통합 시나리오 No. 27(없는 주문 번호 → HTTP 500)은 원인이 분명하고 이미 Fail 상태인 E2E가 있어 "구현 후 Pass로 바뀌는지"를 Loop가 바로 증명할 수 있다.
