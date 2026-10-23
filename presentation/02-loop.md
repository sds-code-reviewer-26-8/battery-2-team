# 2. Loop 설계

Loop 설계는 이번 팀 프로젝트에서 가장 핵심이 되는 내용입니다.

이번 프로젝트에서는 구현 전에 점검하고, 구현 후에는 검증하여 리포트를 작성하는 자신만의 Loop를 각자 설계했습니다.

이 중 소개할 만한 좋은 Loop를 선정하여 소개합니다.

<br>

## 팀 Evidence 템플릿

팀이 함께 쓰는 단일 HTML 템플릿 2개입니다(PR #15). 데이터 자리 한 곳을 JSON으로 교체하면 화면이 만들어지고, 값은 `textContent`로만 넣어 데이터에 HTML 태그가 있어도 실행되지 않습니다. 사람의 판단이 필요한 상태(HILP)는 헤더 색과 질문 카드로 구분하고, FAIL이면 "계획 단계로 되돌아가기 위한 값" 카드가 맨 위에 나옵니다.

<!-- GitHub에서는 .html 파일이 소스로 보입니다. 결과 화면을 캡처해서 presentation/assets/에 올리고 함께 보여주세요. -->

| 템플릿 | 사용 시점 | 링크 |
|---|---|---|
| precheck.html | 구현 전 | [precheck.template.html](../docs/templates/precheck.template.html) |
| report.html | 구현 후 | [report.template.html](../docs/templates/report.template.html) |

<br>

## Best Practice: Loop 설계

팀 프로젝트 중 각자 자신만의 Loop를 소개한 Markdown 페이지를 업로드했습니다. (경로 : `docs/loops/팀원이름/README.md`)

이 중 괜찮다고 생각이 드는 Best Practice Loop를 소개합니다.

#### Best Practice 1

| 항목 | 내용 |
|---|---|
| 소개 팀원 | 박상윤 |
| Loop 설명 링크 | [docs/loops/sy9169/README.md](../docs/loops/sy9169/README.md) |
| 좋았던 점 | 점검 → 구현 → 검증 → 판정, 각 단계를 새 컨텍스트의 서브에이전트로 나눠 서로의 판단에 끌려가지 않음<br>PASS/FAIL을 에이전트의 말이 아니라 테스트 결과 파일과 규칙으로 정하고, 테스트 전에 이전 결과 파일을 지워 가짜 통과를 막음<br>요청이 모호하거나 팀 규칙과 충돌하면 멈추고 사람에게 묻고(HILP), 자동 확인이 불가능한 항목은 억지로 pass 하지 않고 `unverified`로 표시 |

#### Best Practice 2

| 항목 | 내용 |
|---|---|
| 소개 팀원 | 김춘택 |
| Loop 설명 링크 | [docs/loops/ctkim1005/README.md](../docs/loops/ctkim1005/README.md) |
| 좋았던 점 | `/impl-loop <구현할 내용>` 한 줄로 prepare → implement → verify 전체가 실행됨<br>verify가 FAIL이면 `plan_feedback`을 들고 prepare로 복귀(최대 3라운드)하고, 보안 점검과 아키텍처 점검을 병렬로 수행<br>팀 템플릿에 JSON을 끼우는 렌더 스크립트가 필수 키가 빠지면 렌더를 거부해 Evidence 품질이 일정함 |

<br>

## Loop를 돌리며 느꼈던 점

#### 좋았던 점

- 구현 전에 위험과 테스트 케이스를 먼저 적게 하니, 리뷰어가 Evidence만 보고도 "무엇을 왜 바꿨는지" 따라갈 수 있었습니다. (PR #31, #33)
- 점검 단계가 팀 INTENT(G1~G8)와 충돌을 찾아 사람에게 되묻는 덕분에, 모호한 요구("삭제 이후 수정 불가" 등)를 구현 전에 해석하고 PR에 명시할 수 있었습니다.
- FAIL 이유를 들고 점검으로 돌아가는 구조 덕분에 1차 실패가 같은 실수의 반복이 아니라 개선으로 이어졌습니다. (KewryByun Loop: 1차 FAIL → 2차 PASS)

#### 아쉬웠던 점

- Loop를 사람마다 따로 설계해서 사용법이 달랐고, 서로의 Loop를 다른 사람이 바로 돌려 볼 수는 없었습니다. Loop 코드는 로컬 `.claude/`에만 있고 PR에는 설명 문서만 올렸기 때문입니다.
- Loop가 만든 Evidence가 최종 상태와 어긋나기도 했습니다. (예: PR #31 report의 "E2E는 건너뜀"이 이후 직접 실행한 50건 통과와 다름, PR #33 report에 개인 PC 경로 포함)
- 자동 검증이 약한 부분이 남았습니다. 보안 검증은 정해진 패턴 검사 수준이고, 기존 파일 DB로의 컬럼 추가는 사람이 직접 확인해야 했습니다.

#### 문제와 개선

| 문제 | 원인 | 어떻게 개선했나요? |
|---|---|---|
| 1차 시도가 E2E 실패로 FAIL | 안내 문구가 화면에 두 번 나와 Playwright strict mode 위반 | 실패 이유(`plan_feedback`)를 점검 단계로 되돌려 2차에서 수정하고 PASS |
| 에이전트가 결과를 지어내거나 가짜로 통과 처리 | 판정을 에이전트의 보고에 의존 | 테스트 전에 이전 결과 파일 삭제, 결과 파일의 숫자·종료 코드로 규칙 판정, 보고와 별도로 재확인 |
| 변경 전부터 실패하던 테스트를 이번 변경의 실패로 오판 | 기준선 없이 결과만 비교 | 기준선과 비교해 기존 실패를 분리 |
| 검증 중 개발 DB에 '확정' 주문이 남음 | E2E를 파일 DB 서버(8080)에서 실행 | E2E는 인메모리 DB 서버(`jdbc:h2:mem:e2e`)에서만 실행하도록 규칙화 |

---

[← 이전: 테스트 세팅](01-test.md) · [목차](README.md) · [다음: 기능 추가 미션 동작 영상 →](03-missions.md)
