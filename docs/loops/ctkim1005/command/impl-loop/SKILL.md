---
name: impl-loop
description: ctkim1005 의 구현 Loop 명령어. "/impl-loop <요청>" 으로 호출하면 구현 전(문서 규칙 대조 → 사전 점검 precheck.html) → 구현 → 구현 후(보안·아키텍처 점검 → 검증 report.html)를 자동으로 수행하고, FAIL 이면 피드백을 들고 최대 3라운드 반복한다. 사용자가 "loop 돌려줘", "구현 loop", "점검하고 구현하고 검증해줘", "TASK 로 진행", "precheck/report 만들면서 구현" 처럼 말해도 이 skill 을 사용한다. 앱 기능 요청을 받아 코드를 바꾸는 작업이 대상이다.
---

# /impl-loop — 구현 전 · 구현 · 구현 후 자동 Loop

`/impl-loop <요청 한 줄>` 로 호출한다. 요청은 "무엇을 어떻게 바꿔 달라"는 한 문장이면 된다.
예) `/impl-loop 없는 주문 번호를 열면 500 대신 안내 페이지를 보여 준다`

이 명령은 **Workflow 도구**로 이름 있는 Dynamic Workflow `impl-loop`(`.claude/workflows/impl-loop.js`, 원본 `docs/loops/ctkim1005/loop/impl-loop.js`)를 실행한다. Workflow 는 `prepare → implement → verify` subagent(`.claude/agents/`)를 순서대로 부르고, verify 가 FAIL 이면 prepare 로 돌아가며(최대 3라운드), prepare 가 HILP 를 요청하면 종료한다.
설계와 각 단계의 상세는 `docs/loops/ctkim1005/README.md` 에 있다. 이 문서는 "명령을 받았을 때 무엇을 하는가"만 적는다.

## 동작 순서

```
/impl-loop <요청>
   │
   ├─ 0. 준비   작업 번호 정하기, branch·앱 확인, 요청을 Loop 인자로 정리
   ├─ 1. 실행   Workflow(loop.workflow.js) — 라운드마다
   │            구현 전: 문서 규칙 대조 → 사전 점검(precheck.html, HILP 면 멈춤)
   │            구현:    계획대로 코드 수정 + JUnit
   │            구현 후: 보안 점검 ∥ 아키텍처 점검 → 검증(JUnit·E2E·체크리스트, report.html)
   │            PASS → 끝 / FAIL → 피드백 들고 다음 라운드 (최대 3)
   └─ 2. 마무리 최종 precheck.html·report.html 을 작업 폴더 루트에 복사, 결과 요약
               (commit·push·PR 은 하지 않고 사람에게 넘긴다)
```

## 0. 준비 (명령을 받으면 먼저)

1. **요청 확인**: 인자(구현할 내용)가 비어 있으면 실행하지 않고 요청 문장을 달라고 한다.
2. **전제 확인**: 현재 branch 가 `main` 이면 작업 branch 를 먼저 만들자고 제안하고 멈춘다 (사용자가 branch 이름을 주면 만든다). 앱이 `localhost:8080` 에 떠 있는지 `netstat` 으로 확인하고, 꺼져 있으면 띄워도 되는지 묻는다.
3. 작업 번호·관련 코드·테스트·시나리오 조사는 **Workflow 의 첫 단계(prepare 의 사전 조사)가 스스로 한다.** 사용자가 작업 번호나 이름을 지정했으면 `task` 로 넘긴다.

## 1. 실행

Workflow 도구를 **이름으로** 호출한다. 인자는 구현할 내용 한 줄이다.

```
Workflow({ name: "impl-loop", args: "<구현할 내용>" })
```

이름을 찾지 못하면(`Workflow "impl-loop" not found` — `.claude/workflows/` 는 세션 시작 때 읽히므로 방금 설치한 경우) 같은 스크립트를 경로로 호출한다. 동작은 같다.

```
Workflow({ scriptPath: "D:/work/battery-2-team/.claude/workflows/impl-loop.js", args: "<구현할 내용>" })
```

작업 번호나 라운드 수를 지정하려면 객체로 넘긴다.

```
Workflow({ name: "impl-loop", args: { request: "<구현할 내용>", task: "TASK-003-cancel-keeps-order", maxRounds: 3 } })
```

Workflow 안에서 일어나는 일 (라운드마다):
- **prepare** — 사전 조사(첫 라운드만) → 문서 규칙 대조 → 사전 점검 `round-N/precheck.html`. HILP 면 여기서 Loop 종료.
- **implement** — Plan → 구현 → 테스트 추가 → JUnit → 자가검증.
- **verify** — 보안 점검 ∥ 아키텍처 점검 → 회귀·체크리스트 판정 `round-N/report.html`. FAIL 이면 피드백을 들고 다음 라운드의 prepare 로.

실행은 백그라운드로 돌아가며 보통 20~40분 걸린다. 사용자가 진행 상황을 물으면 transcript 폴더의 `journal.jsonl` 과 `docs/evidence/ctkim1005/TASK-NNN-*/round-N/` 에 생긴 파일로 어느 단계인지 알려 준다.

## 2. 마무리 (완료 알림을 받으면)

1. 결과의 `outcome` 에 따라:
   - **PASS**: 마지막 라운드의 `round-N/precheck.html`, `round-N/report.html` 을 작업 폴더 루트 `precheck.html`, `report.html` 로 복사한다.
   - **FAIL** (3라운드 초과): 마지막 리포트와 `feedback` 을 보여 주고, 사람이 방향을 정하게 한다.
   - **HILP**: `questions` 를 그대로 보여 주고 답을 기다린다. 답을 받으면 요청에 그 결정을 덧붙여 다시 `/impl-loop` 를 돌린다.
2. `docs/loops/ctkim1005/README.md` 의 실행 이력 표에 한 줄 추가한다.
3. 사용자에게 요약한다: 라운드 수, 각 단계 판정(규칙/점검/보안/아키텍처/검증), 바뀐 파일, 남은 minor 지적, 산출물 경로. **commit·push·PR 은 하지 않는다** — 사용자가 리포트를 보고 결정한다.

## 지켜야 할 것

- 다른 팀원의 테스트 파일은 수정하지 않는다 (Loop 의 에이전트에게도 같은 제약이 걸려 있다).
- 산출물은 반드시 `docs/evidence/ctkim1005/{작업번호+작업명}/precheck.html`, `report.html` 로 남긴다. 팀 템플릿(`docs/templates/`)과 README 양식을 `render.mjs` 가 강제한다.
- Loop 가 FAIL 이나 HILP 로 끝났을 때 그 사실을 숨기지 않는다. PASS 가 아닌데 PASS 처럼 요약하지 않는다.

## 참고: 명령어 설치

이 폴더는 팀 규칙상 commit 되지 않는 `.claude/` 밖에 있다. 로컬에서 `/impl-loop` 로 쓰려면 복사한다.

```powershell
Copy-Item -Recurse -Force docs\loops\ctkim1005\command\impl-loop .claude\skills\impl-loop
Copy-Item docs\loops\ctkim1005\agents\*.md .claude\agents\     # Loop 가 쓰는 subagent 3개 (prepare / implement / verify)
```
