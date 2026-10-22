# 리팩토링 1 Evidence — Controller / Service / Repository 파일 분할

> PR: 리팩토링 1 (동작 변경 없음). 이 문서는 **리팩토링 전(`main`, `8122f1e`)과 후(`feature-sy9169-mission1-refactoring`)의 결과를 비교**할 수 있도록 모은 것입니다.
> 팀원은 아래 "직접 재현하기"로 전/후를 확인하고, 이 Evidence에서 부족한 점을 PR에 Comment로 남겨 주세요.

## 1. 한눈에 보기

| 항목 | 리팩토링 전 | 리팩토링 후 |
|---|---|---|
| 단위·통합 테스트 | 22개 통과 | **81개 통과** (실패 0) — 기존 22개는 그대로, 특성 테스트 등 추가 |
| E2E (Playwright 44개) | 39 통과 / 5 실패 | **39 통과 / 5 실패 — 테스트 44개 하나하나 결과가 같음** |
| 주문 목록(`/orders`) 한 번에 나가는 SQL | 6번 | 2번 |
| 서비스 파일 | `BatteryService` 1개 | `MasterService`, `SimulationService`, `OrderService` 3개 |
| 컨트롤러 파일 | `AppController` 1개 | 5개 (`AuthController`, `OrderPageController`, `MasterPageController`, `ApiController`, `LoginUserAdvice`) |
| 저장소 파일 | 2개(중첩 인터페이스 6개) | 6개(파일 하나씩) |

**E2E 실패 5개는 리팩토링 전부터 있던 결함이며, 리팩토링 후에도 정확히 같은 5개입니다.** (4번 참고)

## 2. 파일 구조 전/후 (줄 수)

### 전 (`main`)
| 파일 | 줄 수 |
|---|---|
| `controller/AppController.java` | 198 |
| `service/BatteryService.java` | 303 |
| `repository/MasterRepositories.java` | 22 |
| `repository/OrderRepositories.java` | 27 |
| `simulation/Planner.java` | 419 |

### 후
| 파일 | 줄 수 |
|---|---|
| `controller/ApiController.java` | 68 |
| `controller/AuthController.java` | 50 |
| `controller/LoginUserAdvice.java` | 16 |
| `controller/MasterPageController.java` | 52 |
| `controller/OrderPageController.java` | 73 |
| `repository/FactoryRepository.java` | 8 |
| `repository/OrderRepository.java` | 18 |
| `repository/OrderStatusHistoryRepository.java` | 10 |
| `repository/RouteRepository.java` | 7 |
| `repository/SettingRepository.java` | 7 |
| `repository/StatusCount.java` | 11 |
| `service/BusinessException.java` | 34 |
| `service/MasterService.java` | 181 |
| `service/OrderService.java` | 124 |
| `service/SimulationService.java` | 54 |

`Planner.java`는 419줄 → 443줄로 **오히려 늘었습니다**(함수가 나뉘면서 설명 주석이 붙었기 때문). 줄 수를 줄이는 것이 목적이 아니라 긴 함수를 읽기 쉽게 나누는 것이 목적입니다. 올림 나눗셈을 `ceilDiv`로 통일하고, 50줄이던 `schedule`을 `scheduleShip`, `loopOf`, `departDay` 등으로 나눈 결과이며 계산 결과는 같습니다(아래 3번의 golden 비교).

## 3. 동작이 같다는 근거

### 3-1. 리팩토링 전후 비교용 특성 테스트 (목 없음)
커밋 `a0c5765`에서 리팩토링 **전** 코드를 기준으로 만들었고, 이후 리팩토링 동안 기준 파일은 한 글자도 바꾸지 않았습니다.

| 테스트 | 무엇을 비교하나 |
|---|---|
| `PlannerGoldenTest` | 16개 입력(배 1~4척, 한 나라만 주문, 여러 번 방문, 재고 상한 경계, 다른 마스터 값)에 대한 경로 3종의 일수·비용·왕복·방문 순서·일별 재고·생산을 글자로 풀어 `src/test/resources/golden/planner.txt`와 비교 |
| `AppControllerBehaviorTest` | 화면 모델, 오류 메시지, 로그인 검사, `/api/simulate` 응답 전체(JSON)를 `golden/simulate-default.json`과 비교 |
| `ServiceBehaviorTest` | 실제 인메모리 DB로 마스터 검증, 시뮬레이션, 확정, 상태 변경, 이력 |

일부러 코드를 바꿔(`Planner` 동률 비교, 상태 변경 메시지 문구) 확인했을 때 새 테스트 3개가 실패했고, 기존 `PlannerTest`는 둘 다 통과했습니다. 즉 기존 테스트만으로는 못 잡던 변경을 새 테스트가 잡습니다.

### 3-2. 단위·통합 테스트 결과 (`./gradlew test`)
| 클래스 | 테스트 수 | 실패 |
|---|---|---|
| `AppControllerBehaviorTest` | 25 | 0 |
| `AuthControllerAccountTest` | 3 | 0 |
| `DemoApplicationTests` | 1 | 0 |
| `OrderFlowTests` | 9 | 0 |
| `ServiceBehaviorTest` | 29 | 0 |
| `simulation.PlannerGoldenTest` | 2 | 0 |
| `simulation.PlannerTest` | 12 | 0 |
| **합계** | **81** | **0** |

### 3-3. SQL 횟수 (주문 목록 한 번 요청)
- 전: 목록 1 + 상태별 개수 4(상태마다 1번) + 전체 건수용 목록 다시 읽기 1 = **6번**
- 후: 상태별 개수 `group by` 1 + 목록 1 = **2번**
- Hibernate SQL 로그(`logging.level.org.hibernate.SQL=DEBUG`)를 켜고 `/orders` 요청 하나의 구간에서 센 값입니다.

## 4. E2E 결과 (44개, 테스트별 전/후)

실행 조건: 인메모리 DB 격리 서버, `BASE_URL`로 지정, 같은 Playwright 설정·같은 테스트 코드. 전 69초, 후 72초.

### 기존 결함 5개 (리팩토링과 무관, 전후 동일하게 실패)
| 시나리오 | 내용 |
|---|---|
| S5 / No.36 | 깨진 요청에 대한 오류 응답에 서버 내부 정보(`trace`)가 포함됨 (개발 실행 시 devtools 때문) |
| S10 / T27 | 존재하지 않는 주문 번호를 열면 안내 문구 대신 HTTP 500 오류 화면 |
| T26 | 확정·진행 상태에서 취소하면 주문이 삭제되어 '취소' 상태로 남지 않음 |

테스트 코드에 `known-issue`로 표시되어 있던 시나리오이며, 동작을 바꾸는 수정이라 이 PR에서는 고치지 않았습니다. 따라서 "E2E 모두 PASS"는 이 결함들을 고치기 전에는 충족되지 않습니다.

### 전체 44개
| 파일 | 시나리오 | 전 | 후 | 비고 |
|---|---|---|---|---|
| `gauge-linkage.spec.ts` | No.8 수량 게이지 연동: 오른쪽 나라가 반대로 조정 | 통과 | 통과 |  |
| `login-success.spec.ts` | No.1 올바른 계정으로 로그인하면 주문 목록으로 이동 | 통과 | 통과 |  |
| `login.spec.ts` | TC-E2E-001 로그인 → 주문 목록 → 로그아웃 | 통과 | 통과 |  |
| `master-change-confirm-conflict.spec.ts` | No.18 시뮬레이션 뒤 기준값이 바뀌면 확정 거절 | 통과 | 통과 |  |
| `master-change-keeps-order.spec.ts` | No.35 기준값 변경은 이미 확정된 주문의 계획을 바꾸지 않음 | 통과 | 통과 |  |
| `master-default-values.spec.ts` | No.28 기본 기준값 표시 | 통과 | 통과 |  |
| `menu-navigation.spec.ts` | No.5 상단 메뉴로 화면 이동과 현재 메뉴 강조 | 통과 | 통과 |  |
| `order-list-layout.spec.ts` | No.20 목록 화면 구성과 이동(주문 추가, 행 클릭) | 통과 | 통과 |  |
| `order-status-flow.spec.ts` | No.22 핵심 업무 흐름: 확정 → 진행 → 완료, 완료는 최종 상태 | 통과 | 통과 |  |
| `robustness.spec.ts` | S1 인증·접근 통제: 로그인 없이, 로그아웃 후 보호 기능 접근 차단 | 통과 | 통과 |  |
| `robustness.spec.ts` | S3 입력 검증: 총 수량 상한(100,000K) 초과 입력 | 통과 | 통과 |  |
| `robustness.spec.ts` | S4 입력 검증: 화면 제한을 우회한 메모 1,001자 확정 요청 | 통과 | 통과 |  |
| `robustness.spec.ts` | S5 요청 형식: 깨진 요청 뒤에도 앱이 정상 동작 | 실패 | 실패 | 기존 결함 |
| `robustness.spec.ts` | S7 기준값: 시뮬레이션 뒤 기준값이 바뀌면 확정 거절 | 통과 | 통과 |  |
| `robustness.spec.ts` | S8 주문 상태: 허용되지 않는 상태 변경(확정 → 완료) 거절 | 통과 | 통과 |  |
| `robustness.spec.ts` | S10 오류 처리: 존재하지 않는 주문 번호 접근 | 실패 | 실패 | 기존 결함 |
| `scenarios-sy9169park.spec.ts` | [T02] 로그인: 잘못된 계정 정보로 로그인 실패 | 통과 | 통과 |  |
| `scenarios-sy9169park.spec.ts` | [T07] 주문 추가: 총 생산 필요 수 변경 시 4개국 균등 분배, 잘못된 값은 이전 값으로 복구 | 통과 | 통과 |  |
| `scenarios-sy9169park.spec.ts` | [T11] 주문 추가: 경로안 선택 전환 시 화면 갱신 | 통과 | 통과 |  |
| `scenarios-sy9169park.spec.ts` | [T14] 입력 검증: 수량 0, 음수 요청 거절 | 통과 | 통과 |  |
| `scenarios-sy9169park.spec.ts` | [T16] 주문 확정: 메모 없이 확정하면 목록 최상단에 반영 | 통과 | 통과 |  |
| `scenarios-sy9169park.spec.ts` | [T23] 주문 상태: 확정 상태의 변경 버튼 확인과 확인창 취소 시 변화 없음 | 통과 | 통과 |  |
| `scenarios-sy9169park.spec.ts` | [T25] 동시성: 두 탭에서 같은 주문을 동시에 변경하면 나중 요청은 거절 | 통과 | 통과 |  |
| `scenarios-sy9169park.spec.ts` | [T30] 마스터 데이터: 잘못된 기준값은 모두 안내하고 아무것도 저장하지 않음 | 통과 | 통과 |  |
| `scenarios-sy9169park.spec.ts` | [T31] 마스터 데이터: 척당 일 운항비 입력 검증 | 통과 | 통과 |  |
| `simulation-result-visibility.spec.ts` | No.12 시뮬레이션 전 확정 영역 숨김, 입력을 바꾸면 이전 결과 사라짐 | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.4 로그인 상태에서 /login 또는 / 접속 시 주문 목록으로 이동 | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.9 게이지 경계값 보정(초과·음수) | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.13 총 수량 상한(100,000K) 초과 거절과 복구 | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.19 확정된 주문 상세에 저장된 계획 표시 | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.21 상태 필터와 건수 집계 일치 | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.24 허용되지 않는 상태 변경(확정 → 완료) 요청 거절 | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.32 배 척수 범위(1~4): 화면 검증과 우회 요청 거절 | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.33 저장한 기준값이 이후 시뮬레이션에 반영 | 통과 | 통과 |  |
| `ssw60040-prog.spec.ts` | No.36 깨진 요청 뒤에도 앱이 정상 동작 | 실패 | 실패 | 기존 결함 |
| `team-ctkim1005.spec.ts` | T03 접근 통제: 로그인 없이, 로그아웃 후 보호 기능 접근 차단 | 통과 | 통과 |  |
| `team-ctkim1005.spec.ts` | T06 주문 추가: 기본 수량(12,000K)으로 시뮬레이션과 방문 횟수 표시 | 통과 | 통과 |  |
| `team-ctkim1005.spec.ts` | T10 주문 추가: 수량이 0인 나라가 있어도 시뮬레이션 | 통과 | 통과 |  |
| `team-ctkim1005.spec.ts` | T15 주문 확정: 경로안 선택 후 메모와 함께 확정 | 통과 | 통과 |  |
| `team-ctkim1005.spec.ts` | T17 주문 확정: 메모 1,000자 제한 — 화면 입력 제한과 우회 요청 거절 | 통과 | 통과 |  |
| `team-ctkim1005.spec.ts` | T26 주문 상태: 확정·진행 상태에서 취소 (결함 후보) | 실패 | 실패 | 기존 결함 |
| `team-ctkim1005.spec.ts` | T27 주문 상태: 존재하지 않는 주문 번호 접근 (결함 후보) | 실패 | 실패 | 기존 결함 |
| `team-ctkim1005.spec.ts` | T29 마스터 데이터: 값 수정 후 저장하면 유지됨 | 통과 | 통과 |  |
| `team-ctkim1005.spec.ts` | T34 마스터 데이터: 항로 일수 변경 시 소요일 증가 | 통과 | 통과 |  |

## 5. 직접 재현하기

```
# 전: 리팩토링 이전 main
git checkout main
./gradlew test
./gradlew bootRun --args="--server.port=8083 --spring.datasource.url=jdbc:h2:mem:e2emain;DB_CLOSE_DELAY=-1"
BASE_URL=http://localhost:8083 npx playwright test

# 후: PR 브랜치
git checkout feature-sy9169-mission1-refactoring
./gradlew test
./gradlew bootRun --args="--server.port=8082 --spring.datasource.url=jdbc:h2:mem:e2e;DB_CLOSE_DELAY=-1"
BASE_URL=http://localhost:8082 npx playwright test
```
- E2E는 이미 실행 중인 서버를 대상으로 하므로 서버를 먼저 띄웁니다. 인메모리 DB로 띄우면 파일 DB(`data/`)를 건드리지 않습니다.
- 전/후 모두 `39 passed, 5 failed`가 나오고, 실패 목록이 4번의 5개와 같으면 같은 결과입니다.
- 특성 테스트 기준 파일을 다시 만들 때(계산 규칙을 일부러 바꿀 때만): 환경변수 `GOLDEN_UPDATE=true`로 `./gradlew test`를 실행합니다.

## 6. 한계 (이 Evidence가 보장하지 않는 것)
- E2E가 대신 확인한 범위는 화면 흐름입니다. 이번 리팩토링은 화면 템플릿을 바꾸지 않았으므로 화면 모양은 확인 대상이 아닙니다.
- 기존 결함 5개는 고치지 않았습니다. 위 4번 참고.
- 파일 분할로 클래스 이름이 바뀌어, 기존 테스트 `OrderFlowTests`는 주입 대상 타입(`BatteryService` → `OrderService`)만 바꿨습니다. 검증 내용은 그대로입니다.
