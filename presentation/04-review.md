# 4. PR & 코드리뷰

Action과 Gate 규칙을 적용하여 PR & 코드 리뷰를 진행했습니다.

기능 추가를 담당한 팀원은 Action의 역할로서 기능을 개발하는 동시에 Code Smell을 추가했습니다.

다른 팀원은 Gate 역할로서 코드 리뷰 활동을 하며 Agent와 함께 개선안을 도출하는 프로세스로 진행했습니다.

미션별 PR 현황을 정리하고, Best Practice를 선정하여 좋았던 점을 적어 봅니다.

<br>

## 미션별 PR 현황

<!-- 각 미션은 Action과 Gate를 1명씩 담당합니다. 누가 무엇을 담당했는지 아래 표에 적으세요. -->

| 미션 | Action 담당자 | Gate 담당자 | PR 링크 | 리뷰 코멘트 수 | Commit 수 |
|---|---|---|---|:-:|:-:|
| 기능 1. 회원 가입 (Red) | 박상윤 | 변규리 | [#30](https://github.com/sds-code-reviewer-26-8/battery-2-team/pull/30) | 2개 | 12개 |
| 기능 2. 고객사 입력·수정 (Yellow) | 송상우 | 김춘택 | [#31](https://github.com/sds-code-reviewer-26-8/battery-2-team/pull/31) | 5개 | 2개 |
| 기능 3. 공장 운영비 (Red) | 변규리 | 송상우 | [#32](https://github.com/sds-code-reviewer-26-8/battery-2-team/pull/32) | 7개 | 3개 |
| 기능 4. 필요 납기일 (Yellow) | 김춘택 | 박상윤 | [#33](https://github.com/sds-code-reviewer-26-8/battery-2-team/pull/33) | 5개 | 3개 |

리뷰 코멘트 수는 리뷰 본문, 인라인 코멘트, 일반 댓글을 합한 값입니다.

<br>

## Best Practice: 코드 리뷰

<!-- 코드 리뷰를 하며 효과를 본 Best Practice를 1개 이상 소개하세요. 쓰지 않는 블록은 지워도 됩니다. 예: PR 올리기 전 셀프 점검, 리뷰 체크리스트, 개선 제안 유형(리팩토링, 성능, TC 보강, 버그·보안)별 분류 -->

#### Best Practice 1

| 항목 | 내용 |
|---|---|
| 구현 내용 | 회원가입 (가입 코드, BCrypt, 권한 값 ADMIN) — Red 영역 |
| PR 링크 | [PR #30](https://github.com/sds-code-reviewer-26-8/battery-2-team/pull/30) |
| 문제 상황 | 인증·권한 변경이라 가볍게 보고 넘어갈 수 없고, 가입자 전원이 ADMIN이라 가입 코드가 곧 관리자 권한인 구조였습니다. |
| 적용한 방법 | Gate가 PR을 체크아웃해 Red 파일을 모두 읽고 121개 테스트·E2E 56개를 직접 돌렸습니다. 제안을 동작 변경(🔴), 작은 개선(🟡), 테스트 보강, 문서로 나누고, 동시 가입 테스트(8개 스레드가 같은 아이디로 가입)를 직접 작성·검증해 코드로 첨부했습니다. |
| 좋았던 점 | 가입·로그인 시도 횟수 제한, 운영 기본값(`signup`, `admin/admin`) 기동 차단, 세션 쿠키·권한 정책, 공백뿐인 비밀번호 가입 같은 실제 위험을 구현자와 판단 항목으로 나눠 논의할 수 있었습니다. Evidence 수치(`MemberServiceTest` 16 → 실제 20)의 오타도 잡았습니다. |
| Evidence | [PR #30 리뷰](https://github.com/sds-code-reviewer-26-8/battery-2-team/pull/30) 의 Gate 리뷰, `docs/evidence/sy9169/signup/README.md` |

#### Best Practice 2

| 항목 | 내용 |
|---|---|
| 구현 내용 | 주문 시 필요 납기일 지정 + 납기 초과 경로 빨간 표시 — Yellow 영역 |
| PR 링크 | [PR #33](https://github.com/sds-code-reviewer-26-8/battery-2-team/pull/33) |
| 문제 상황 | `Order`에 컬럼이 추가되는 DB 스키마 변경인데, "납기 없는 기존 주문"을 검증하는 테스트가 없었습니다. |
| 적용한 방법 | Gate가 PR을 체크아웃해 JUnit 98개·E2E 48개를 재현하고, 기존 파일 DB(`data/battery`) **복사본**으로 직접 기동해 컬럼 3개가 자동 추가되고 기존 주문은 null로 남는지 확인했습니다. Evidence(precheck/report)는 잘 된 점과 정리할 점(E1~E3)으로 나눠 리뷰하고, 제안 3가지는 로컬에서 적용해 테스트했습니다. |
| 좋았던 점 | 말로만 "호환된다"고 넘기지 않고 스키마 변경을 실제 데이터로 확인했습니다. 리뷰 중에 report에 들어간 개인 PC 경로와, 파일 DB에서 E2E를 돌려 주문이 남는 문제도 찾아냈습니다. |
| Evidence | [PR #33 리뷰](https://github.com/sds-code-reviewer-26-8/battery-2-team/pull/33), `docs/evidence/ctkim1005/TASK-004-due-date/` (`precheck.html`, `report.html`) |

---

[← 이전: 기능 추가 미션 동작 영상](03-missions.md) · [목차](README.md) · [다음: 회고 →](05-retrospective.md)
