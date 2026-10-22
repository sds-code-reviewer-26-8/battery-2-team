export const meta = {
  name: 'impl-loop',
  description: 'prepare → implement → verify subagent 로 구현하는 검증 Loop. verify 실패 시 prepare 로 돌아가고(최대 3라운드), prepare 가 HILP 를 요청하면 종료한다. precheck.html / report.html 을 docs/evidence/ctkim1005/TASK-NNN-이름/ 에 남긴다.',
  whenToUse: '/impl-loop <구현할 내용> — 앱 기능 요청을 받아 사전 점검·구현·검증을 자동으로 돌릴 때',
  phases: [
    { title: 'Scout', detail: 'prepare: 작업 번호 결정, 관련 코드·테스트·시나리오 조사' },
    { title: 'Rule check', detail: 'prepare: 요청을 팀 PRD/INTENT 규칙과 대조' },
    { title: 'Precheck', detail: 'prepare: 배경·목적·위험·테스트·체크리스트·계획 → precheck.html (HILP 면 종료)' },
    { title: 'Implement', detail: 'implement: Plan → 구현 → 테스트 추가 → JUnit → 자가검증' },
    { title: 'Security', detail: 'verify: 변경분 보안 점검' },
    { title: 'Architecture', detail: 'verify: 변경분 계층·패키지 규칙 점검' },
    { title: 'Verify', detail: 'verify: 체크리스트 확인 + 모든 회귀 테스트 → report.html, 리뷰 로그 (FAIL 이면 prepare 로)' },
    { title: 'Report', detail: 'verify: PASS 시 prepare/implement/verify 가 한 일을 정리한 최종 리포트 (docs/logs/reports/report_*.HTML)' },
  ],
}

// ---------------------------------------------------------------- 인자
// Argument: 구현할 내용 (문자열). 객체로 주면 request 외에 task / maxRounds / today 를 덮어쓸 수 있다.
const opt = typeof args === 'string' ? { request: args } : (args || {})
// 따옴표만 있는 문자열("", '')이나 공백은 빈 요청으로 본다
const request = String(opt.request == null ? '' : opt.request).replace(/^[\s"'`]+|[\s"'`]+$/g, '')
if (!request) {
  return { outcome: 'ERROR', reason: '구현할 내용(request)이 비어 있다. /impl-loop <구현할 내용> 으로 호출한다.' }
}
const maxRounds = opt.maxRounds || 3
const repo = opt.repo || 'D:/work/battery-2-team'
const owner = opt.owner || 'ctkim1005'
const evidenceRoot = `docs/evidence/${owner}`
const renderScript = `docs/loops/${owner}/loop/render.mjs`

const COMMON_BASE = `
## 공통 환경
- 저장소: ${repo} (Windows). Bash 도구에서 forward slash 경로를 쓴다. 예) cd ${repo}
- commit/push 는 절대 하지 않는다. 파일 수정만 한다.
- 명령: JUnit = ./gradlew.bat test --console=plain, E2E = npx playwright test ... --reporter=list, Python = py -3, Node = node
- 앱: http://localhost:8080 에서 실행 중이어야 한다 (Spring Boot devtools 포함, 로그인 admin/admin). 8080 확인: netstat -ano | grep ":8080 .*LISTENING"
- 요청(구현할 내용): ${request}
- HTML 렌더: node ${renderScript} <precheck|report> <data.json> <out.html>  (팀 템플릿 docs/templates/*.html 사용, 데이터 키는 docs/templates/README.md 참고)
- 팀 기준 문서: docs/PRD-INTENT/team/PRD.md (§4 기능 F1~F12, §5 계산 규칙, §6 주문 상태, §7 데이터 신뢰 D1~D6, §9 범위 밖, §10 쟁점), docs/PRD-INTENT/team/INTENT.md (§2 의도 I1~I9, §4 지킬 방향 G1~G8, §6, §7 미결)
- 팀 통합 E2E 시나리오: docs/e2e/team/test-senarios.xlsx ('시나리오' 시트, 4행이 머리글; py -3 + openpyxl 로 읽는다)
- 모든 글은 한국어로 쓴다.
- 다른 팀원의 테스트 파일(robustness.spec.ts, scenarios-sy9169park.spec.ts, ssw60040-prog.spec.ts, KewryByun 의 *.spec.ts, helpers.ts, ui-helpers.ts)은 수정하지 않는다.
`

// ---------------------------------------------------------------- 스키마

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    task: { type: 'string' },
    today: { type: 'string' },
    branch: { type: 'string' },
    appRunning: { type: 'boolean' },
    relatedCode: { type: 'string' },
    relatedTests: { type: 'string' },
    targetTests: { type: 'string' },
    scenario: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['task', 'today', 'branch', 'appRunning', 'relatedCode', 'relatedTests', 'targetTests', 'scenario', 'summary'],
}

const RULECHECK_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['OK', 'CONFLICT', 'UNRESOLVED'] },
    conflicts: { type: 'array', items: { type: 'object', properties: { rule: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['rule', 'detail', 'severity'] } },
    unresolved: { type: 'array', items: { type: 'object', properties: { rule: { type: 'string' }, detail: { type: 'string' } }, required: ['rule', 'detail'] } },
    supports: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'conflicts', 'unresolved', 'supports', 'summary'],
}

const PRECHECK_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['READY', 'HILP'] },
    reason: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
    plan: { type: 'string' },
    checklist: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'] } },
    riskSize: { type: 'string' },
    jsonPath: { type: 'string' },
    htmlPath: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['status', 'reason', 'questions', 'plan', 'checklist', 'riskSize', 'jsonPath', 'htmlPath', 'summary'],
}

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    junitCommand: { type: 'string' },
    junitTotal: { type: 'number' },
    junitFailed: { type: 'number' },
    appRestarted: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['summary', 'filesChanged', 'junitCommand', 'junitTotal', 'junitFailed', 'appRestarted', 'notes'],
}

const FINDING = { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, location: { type: 'string' }, problem: { type: 'string' }, reproduce: { type: 'string' } }, required: ['severity', 'location', 'problem', 'reproduce'] }
const SECURITY_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, checked: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['findings', 'checked', 'summary'] }
const ARCH_SCHEMA = { type: 'object', properties: { violations: { type: 'array', items: FINDING }, checked: { type: 'array', items: { type: 'string' } }, layersOk: { type: 'boolean' }, summary: { type: 'string' } }, required: ['violations', 'checked', 'layersOk', 'summary'] }

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    loop_action: { type: 'string', enum: ['END', 'RETRY'] },
    summary: { type: 'string' },
    failed_checklist: { type: 'array', items: { type: 'string' } },
    failed_tests: { type: 'array', items: { type: 'string' } },
    suggested_focus: { type: 'array', items: { type: 'string' } },
    junitTotal: { type: 'number' },
    junitFailed: { type: 'number' },
    e2eTotal: { type: 'number' },
    e2eFailed: { type: 'number' },
    e2eKnownIssueFailed: { type: 'number' },
    jsonPath: { type: 'string' },
    htmlPath: { type: 'string' },
    reviewLogPath: { type: 'string' },
  },
  required: ['verdict', 'loop_action', 'summary', 'failed_checklist', 'failed_tests', 'suggested_focus', 'junitTotal', 'junitFailed', 'e2eTotal', 'e2eFailed', 'e2eKnownIssueFailed', 'jsonPath', 'htmlPath', 'reviewLogPath'],
}

const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    reportHtmlPath: { type: 'string' },
    reportJsonPath: { type: 'string' },
    finalPrecheck: { type: 'string' },
    finalReport: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['reportHtmlPath', 'reportJsonPath', 'finalPrecheck', 'finalReport', 'summary'],
}

// ---------------------------------------------------------------- 프롬프트

function scoutPrompt() {
  return `[prepare 역할 0: 사전 조사] 코드는 고치지 않는다.
${COMMON_BASE}
## 할 일
1. 작업 번호: ls ${repo}/${evidenceRoot} 에서 TASK-NNN-* 폴더의 가장 큰 번호 +1 을 쓴다 (없으면 001). ${opt.task ? `사용자가 지정한 작업 번호/이름이 있으니 그대로 쓴다: ${opt.task}` : '이름은 요청을 영어 kebab-case 2~4단어로 줄인다. 예) TASK-003-cancel-keeps-order'}
2. 오늘 날짜: date +%Y-%m-%d 로 읽어 today 에 넣는다.
3. 환경: git branch --show-current 로 branch 를 읽고, 8080 리스닝 여부를 appRunning 에 넣는다. main 이면 summary 에 경고를 적는다(그래도 진행은 사전 점검이 판단한다).
4. 요청과 직접 관련된 소스 파일을 찾아(grep, 템플릿·컨트롤러·서비스) relatedCode 에 "파일: 현재 동작 한 줄" 형식으로 적는다. 작업 트리에 commit 되지 않은 변경이 있으면 그것도 적는다.
5. 이 요청을 검증하는 기존 테스트를 찾아 relatedTests 에 "파일(행): 테스트 이름, known-issue 여부" 로 적는다 (src/test/e2e/*.spec.ts, src/test/java). 없으면 "없음".
6. targetTests: 이번 구현으로 반드시 통과해야 하는 테스트. known-issue 로 Fail 중인 대상 시나리오가 있으면 그것. 없으면 "신규 테스트로 검증".
7. scenario: 팀 통합 시나리오에 해당 No. 가 있으면 그 행(No./영역/시나리오/절차/목적/Pass 조건/담당자) 본문을 그대로, 없으면 요청을 같은 형식(절차/목적/Pass 조건)으로 풀어 쓴다.
8. 구조화 결과로 task, today, branch, appRunning, relatedCode, relatedTests, targetTests, scenario, summary(3문장 이내)를 돌려준다.`
}

function ruleCheckPrompt(round, ctx, feedback) {
  const fb = feedback ? `\n## 이전 라운드 피드백\n${feedback.summary}\n` : ''
  return `[prepare 역할 A: 문서 규칙 대조] 라운드 ${round}. 코드는 고치지 않고 문서만 읽는다.
${ctx.common}${fb}
## 할 일
1. docs/PRD-INTENT/team/PRD.md 와 docs/PRD-INTENT/team/INTENT.md 를 읽는다.
2. 요청을 다음 항목과 하나씩 대조한다: PRD §4 F1~F12, §5 계산 규칙, §6 주문 상태, §7 D1~D6, §9 범위 밖, §10 쟁점 1~8 / INTENT §2 I1~I9, §4 G1~G8, §6 의도적으로 하지 않은 것, §7 미결 1~8.
3. 분류: conflicts(요청대로 구현하면 어기게 되는 규칙, severity 는 영향 크기) / unresolved(팀이 아직 결정하지 않은 쟁점·미결에 의존; 요청 자체가 그 결정을 내리는 셈이면 detail 에 그렇다고 쓴다) / supports(요청을 뒷받침하는 규칙, 문장 인용).
4. verdict: conflicts 가 있으면 CONFLICT, 없고 unresolved 만 있으면 UNRESOLVED, 둘 다 없으면 OK.
5. 구조화 결과로 verdict, conflicts, unresolved, supports, summary(3문장 이내)를 돌려준다.`
}

function precheckPrompt(round, ctx, feedback, rules) {
  const fb = feedback
    ? `\n## 이전 라운드(${round - 1}) 검증 피드백 — 이번 계획에 반드시 반영\n- 요약: ${feedback.summary}\n- 실패한 체크리스트: ${feedback.failed_checklist.join(' / ') || '없음'}\n- 실패한 테스트: ${feedback.failed_tests.join(' / ') || '없음'}\n- 집중할 것: ${feedback.suggested_focus.join(' / ') || '없음'}\n`
    : ''
  const rc = `
## 문서 규칙 대조 결과 (그대로 반영)
- 판정: ${rules.verdict}
- 충돌: ${rules.conflicts.length ? rules.conflicts.map(c => `[${c.severity}] ${c.rule}: ${c.detail}`).join(' / ') : '없음'}
- 미결 의존: ${rules.unresolved.length ? rules.unresolved.map(u => `${u.rule}: ${u.detail}`).join(' / ') : '없음'}
- 뒷받침 규칙: ${rules.supports.join(' / ') || '없음'}
- 요약: ${rules.summary}
규칙: CONFLICT 면 status=HILP 로 하고 충돌 항목을 questions 에 질문으로 바꾼다. UNRESOLVED 면 요청이 그 미결을 스스로 결정하는지 판단해, 결정이 사람 몫이면 HILP, 요청이 이미 방향을 정했고 뒷받침 규칙이 있으면 READY 로 하고 근거를 plan 에 적는다. 충돌·미결 항목은 모두 risk.items 에 넣는다.
`
  return `[prepare 역할 B: 사전 점검] 라운드 ${round}.
${ctx.common}${rc}${fb}
## 할 일 (agent 정의의 "B. 사전 점검" 순서와 판정 규칙을 따른다)
1. 환경 점검: cd ${repo} 후 git status --short (코드 변경이 있으면 파악해 두고 지우지 않는다), 8080 리스닝 확인. 앱이 안 떠 있으면 reason 에 적고 status 를 HILP 로 한다.
2. 배경 이해 체크: 관련 코드를 읽어 현재 동작과 원인을 한 줄로 설명하고 curl 로 재현한다 (로그인 쿠키: curl -s -c /tmp/c.txt -d "username=admin&password=admin" http://localhost:8080/login -o /dev/null 후 curl -s -b /tmp/c.txt ...). 근거를 background.evidence 에 넣고 background.understood 를 정직하게 판정한다. 이해하지 못했으면 HILP.
3. 목적 이해 체크: 팀 PRD/INTENT 의 뒷받침 문장을 purpose.evidence 에 인용하고 purpose.understood 를 판정한다 (규칙 대조의 뒷받침 규칙 포함). 이해하지 못했으면 HILP.
4. 위험 평가: risk.size(small/medium/large), risk.severity(low/medium/high), 영향 범위를 risk.items 에. 규칙 대조의 충돌·미결 항목도 risk.items 에. size=large 또는 severity=high 인데 User 가 모르는 것으로 보이면(요청에 그 사실이 없음) risk.userAware=false, risk.warning 에 경고를 쓰고 HILP.
5. 테스트 점검: 기존 테스트 중 이 변경을 검증하는 것과 새로 추가할 테스트를 testCases 에 정리한다. kind 는 regression/boundary/feature, origin 은 existing/new.
6. 구현 후 꼭 확인할 가장 중요한 체크리스트 3개 (① 기능 동작 ② 기존 동작·API 불변 ③ JUnit + 대상 E2E 통과 — 요청에 맞는 URL·상태 코드·문구로 구체화). verify 가 이 3개를 그대로 판정한다.
7. 구현 계획을 파일 단위로 구체적으로 (어느 파일에 무엇을, 상태 코드, 템플릿 이름, 테스트 위치, 선택 근거). HILP 면 비운다.
8. HILP 최종 판단: 위 2·3·4 와 규칙 대조 규칙을 따르고, 그 외에도 사람이 정해야 결과가 크게 바뀌는 선택이 있으면 HILP. HILP 면 reason 과 questions 를 채운다.
9. 점검 로그: 점검 내용(작업 번호·요청, 배경/목적 이해 판정과 근거, 위험·경고, 규칙 대조, 테스트 점검, 체크리스트 3개, 계획, 최종 status 와 HILP 사유·질문)을 ${repo}/docs/logs/prepare/inspection_$(date +%Y%m%d_%H%M%S).log 에 저장한다 (mkdir -p docs/logs/prepare). 로그 경로를 plan 끝(HILP 면 reason 끝)에 한 줄로 적는다.
10. JSON 을 ${ctx.evidenceDir}/round-${round}/precheck.json 에 저장(README 의 precheck 키 전부, round=${round}, request="${request}")하고
   node ${renderScript} precheck ${ctx.evidenceDir}/round-${round}/precheck.json ${ctx.evidenceDir}/round-${round}/precheck.html
   로 HTML 을 만든 뒤 ls 로 확인한다.
11. 구조화 결과로 status, reason, questions, plan, checklist(3개), riskSize, jsonPath, htmlPath, summary(3문장 이내)를 돌려준다.`
}

function implementPrompt(round, ctx, pre) {
  return `[implement] 라운드 ${round}.
${ctx.common}
## 사전 점검 결과 (이대로 구현한다)
- 계획: ${pre.plan}
- 구현 후 확인할 체크리스트: ${pre.checklist.map((c, i) => `${i + 1}) ${c.title} — ${c.detail}`).join(' / ')}
- 점검 페이지: ${pre.htmlPath}

## 할 일 (agent 정의의 작업 순서를 따른다: Plan → 코드 수정 → 테스트 추가 → JUnit → 앱 반영 → 자가검증 → 변경 목록)
- Plan 을 먼저 적고 notes 맨 앞에 남긴다.
- 사전 점검 testCases 의 origin=new 를 src/test/java/com/example/demo/OrderFlowTests.java 에 MockMvc 로 추가한다 (이미 있으면 건너뛴다).
- cd ${repo} && ./gradlew.bat test --console=plain 전부 통과 (최대 3회 수정). 수치는 build/test-results/test/*.xml 합계.
- 앱 반영 확인 (10초 대기 후 curl). 안 됐으면 재시작: netstat 으로 8080 PID → taskkill //PID <pid> //F //T → (cd ${repo} && nohup ./gradlew.bat bootRun --console=plain > /tmp/bootrun.log 2>&1 &) → /login 이 200 될 때까지 최대 120초.
- 자가검증 후 git diff --stat / git status --short 로 filesChanged 를 모은다. commit 금지.
- 구조화 결과로 summary, filesChanged, junitCommand, junitTotal, junitFailed, appRestarted, notes("Plan → 자가검증 결과 → 남은 우려")를 돌려준다.`
}

function securityPrompt(round, ctx, impl) {
  return `[verify 역할 A: 보안 점검] 라운드 ${round}. 코드는 고치지 않는다.
${ctx.common}
## 대상
- 바뀐 파일: ${impl.filesChanged.join(', ')}
- cd ${repo} && git diff 와 git status --short 로 변경분(신규 파일 포함)을 읽는다. 변경과 맞닿은 기존 코드도 본다.
## 할 일
agent 정의의 보안 점검 항목(접근 통제 우회, 입력 검증·XSS, 오류 응답 내부 정보 노출(curl 로 실제 본문 확인), 상태 코드·API 불변, version 검사 약화, 설정 변경 영향, 로그 인젝션)을 각각 확인하고 checked 에 적는다.
findings 는 재현 방법이 있는 실제 문제만. severity: blocker = 공격 가능·정보 유출, major = 보호 약화, minor = 권고.
구조화 결과로 findings, checked, summary 를 돌려준다.`
}

function architecturePrompt(round, ctx, impl) {
  return `[verify 역할 B: 아키텍처 점검] 라운드 ${round}. 코드는 고치지 않는다.
${ctx.common}
## 대상
- 바뀐 파일: ${impl.filesChanged.join(', ')}
- cd ${repo} && git diff 와 git status --short 로 변경분(신규 파일 포함)을 읽는다.
## 할 일
agent 정의의 계층 규칙(패키지 의존 방향 controller → service → repository/simulation → entity, 컨트롤러 책임 범위, 공통 조각·헬퍼 재사용, 코드 관례, 공개 계약 유지)을 각각 확인하고 checked 에 적는다. import 방향은 grep "^import com.example" 으로 확인한다.
violations 는 규칙 위반만. severity: blocker = 의존 방향 위반·계약 파괴, major = 계층 책임 위반, minor = 관례 불일치. layersOk 는 blocker/major 가 없으면 true.
구조화 결과로 violations, checked, layersOk, summary 를 돌려준다.`
}

function verifyPrompt(round, ctx, pre, impl, sec, arch) {
  const secText = sec.findings.length ? sec.findings.map(f => `[${f.severity}] ${f.location}: ${f.problem} (재현: ${f.reproduce})`).join(' / ') : '없음'
  const archText = arch.violations.length ? arch.violations.map(f => `[${f.severity}] ${f.location}: ${f.problem}`).join(' / ') : '없음'
  return `[verify 역할 C: 검증·리포트] 라운드 ${round}.
${ctx.common}
## 입력
- 사전 점검 페이지: ${pre.htmlPath} (JSON: ${pre.jsonPath})
- 체크리스트: ${pre.checklist.map((c, i) => `${i + 1}) ${c.title} — ${c.detail}`).join(' / ')}
- 구현 요약: ${impl.summary}
- 바뀐 파일: ${impl.filesChanged.join(', ')}
- 구현 담당 메모(Plan·자가검증): ${impl.notes}
- 보안 점검: ${sec.summary} / 발견: ${secText}
- 아키텍처 점검: ${arch.summary} / layersOk=${arch.layersOk} / 위반: ${archText}

## 할 일 (agent 정의의 "C. 검증·리포트" 순서와 판정 규칙을 따른다)
1. 앱 반영 확인 (curl, 로그인 쿠키). 안 됐으면 implement 와 같은 방법으로 재시작.
2. prepare 의 체크리스트 3개를 각각 실제로 확인해 pass/fail/unverified 로 판정하고 evidence 에 명령·결과를 적는다.
3. 보유한 Regression Test 를 모두 돌린다. JUnit: cd ${repo} && ./gradlew.bat test --console=plain, build/test-results/test/*.xml 에서 테스트 단위 결과 수집 → regression. E2E: npx playwright test --reporter=list 전체 실행 (2~3분). 실패 건은 코드의 'known-issue' 표시를 grep 으로 확인해 허용/불허. 이번 요청의 대상 테스트(${ctx.targetTests})는 known-issue 여도 통과해야 한다.
4. 보안·아키텍처 결과를 issues 에 옮긴다. 보안 blocker 또는 아키텍처 blocker/major 는 FAIL 사유. minor 는 기록.
5. 판정: 체크리스트 전부 pass + JUnit 실패 0 + 대상 E2E 통과 + 그 외 실패는 known-issue 뿐 + 보안 blocker 없음 + 아키텍처 blocker/major 없음 → verdict=PASS, loop_action=END. 아니면 verdict=FAIL, loop_action=RETRY 와 함께 prepare 로 돌아가기 위한 plan_feedback(summary, failed_checklist, failed_tests, suggested_focus; 보안·아키텍처 지적은 suggested_focus 에)을 구체적으로 쓴다.
6. 리뷰 로그: 점검·피드백 내용(작업 번호·요청·라운드, 앱 반영 확인, 체크리스트 판정과 근거, JUnit/E2E 결과와 실패 목록, 보안·아키텍처 지적, 최종 verdict·loop_action, FAIL 이면 plan_feedback 전문)을 ${repo}/docs/logs/verify/review_$(date +%Y%m%d_%H%M%S).log 에 저장한다 (mkdir -p docs/logs/verify). 로그 경로를 summary 끝에 한 줄로 적고 reviewLogPath 로도 돌려준다.
7. JSON 을 ${ctx.evidenceDir}/round-${round}/report.json 에 저장(README 의 report 키 전부, round=${round}, request="${request}", precheck_link="./precheck.html", commands 에 실행 명령과 결과 요약)하고
   node ${renderScript} report ${ctx.evidenceDir}/round-${round}/report.json ${ctx.evidenceDir}/round-${round}/report.html
   로 HTML 을 만든 뒤 ls 로 확인한다.
8. 테스트가 남긴 데이터는 정리 상황을 적는다 (코드·데이터는 되돌리지 않는다).
9. 구조화 결과로 verdict, loop_action, summary, failed_checklist, failed_tests, suggested_focus, junitTotal, junitFailed, e2eTotal, e2eFailed, e2eKnownIssueFailed, jsonPath, htmlPath, reviewLogPath 를 돌려준다.`
}

function finalReportPrompt(ctx, roundsDone, last) {
  const hist = roundsDone.map(r => `- 라운드 ${r.round}: 규칙 ${r.rules ? r.rules.verdict : '-'} / 사전 점검 ${r.pre ? r.pre.status : '-'} / 구현 ${r.impl ? '완료' : '-'} / 보안 발견 ${r.sec ? r.sec.findings.length : '-'} / 아키텍처 위반 ${r.arch ? r.arch.violations.length : '-'} / 검증 ${r.rep ? r.rep.verdict : '-'}`).join('\n')
  return `[verify 역할 D: 최종 Report] Loop 가 PASS 로 끝났다. prepare / implement / verify 가 각각 무엇을 했는지 읽기 쉽고 짧게 정리한 최종 리포트를 만든다. 코드는 고치지 않는다.
${ctx.common}
## 입력
- 마지막 라운드 ${last.round}: precheck JSON ${last.pre.jsonPath}, report JSON ${last.rep.jsonPath}
- 사전 점검 요약: ${last.pre.summary}
- 구현 요약: ${last.impl.summary} / 바뀐 파일: ${last.impl.filesChanged.join(', ')} / 구현 메모(Plan·자가검증): ${last.impl.notes}
- 보안: ${last.sec.summary} (발견 ${last.sec.findings.length}) / 아키텍처: ${last.arch.summary} (위반 ${last.arch.violations.length}, layersOk=${last.arch.layersOk})
- 검증 요약: ${last.rep.summary} / JUnit ${last.rep.junitTotal - last.rep.junitFailed}/${last.rep.junitTotal} / E2E ${last.rep.e2eTotal - last.rep.e2eFailed}/${last.rep.e2eTotal} (known-issue 실패 ${last.rep.e2eKnownIssueFailed})
- 라운드 이력:
${hist}

## 할 일 (agent 정의의 "D. 최종 Report" 를 따른다)
1. 위 입력과 precheck.json / report.json 을 읽어 summary JSON 을 만든다. 키: title, task="${ctx.task}", request, verdict="PASS", roundCount, date, owner="${owner}", tiles(JUnit·E2E·known-issue 실패·보안 발견·아키텍처 위반; {label, value, tone: ok|bad|없음}), stages.prepare|implement|verify({did: 짧은 문장 3개 안팎, status: 한 줄}), checklist({title, result, evidence} — report.json 의 checklist 그대로), history(라운드별 {round, rules, precheck, implemented, security, architecture, verdict}), filesChanged, issues(남은 minor 포함, {severity, location, problem}), links(precheck.html·report.html 로 가는 상대 경로 — docs/logs/reports/ 기준 "../../evidence/${owner}/${ctx.task}/precheck.html" 형식).
2. ts=$(date +%Y%m%d_%H%M%S) 로 시각을 읽고, JSON 을 ${repo}/docs/logs/reports/report_$ts.json 에 저장한 뒤
   node ${renderScript} summary docs/logs/reports/report_$ts.json docs/logs/reports/report_$ts.HTML
   로 HTML 을 만든다 (mkdir -p docs/logs/reports). ls 로 확인한다.
3. 마지막 라운드의 ${ctx.evidenceDir}/round-${last.round}/precheck.html 과 report.html 을 ${ctx.evidenceDir}/precheck.html, ${ctx.evidenceDir}/report.html 로 복사한다 (필수 산출물 위치).
4. 구조화 결과로 reportHtmlPath, reportJsonPath, finalPrecheck, finalReport, summary(3문장 이내)를 돌려준다.`
}

// ---------------------------------------------------------------- Loop

// 0. 사전 조사 (prepare) — 한 번만
phase('Scout')
const scout = await agent(scoutPrompt(), { phase: 'Scout', label: 'scout', schema: SCOUT_SCHEMA, agentType: 'prepare' })
if (!scout) return { outcome: 'ERROR', stage: 'scout', request }
const task = opt.task || scout.task
const evidenceDir = `${evidenceRoot}/${task}`
const ctx = {
  task,
  evidenceDir,
  targetTests: scout.targetTests,
  common: `${COMMON_BASE}
- 작업 번호: ${task}
- 산출물 폴더: ${evidenceDir}/round-<N>/  (N = 라운드 번호)
- 날짜: ${opt.today || scout.today}
- 관련 코드: ${scout.relatedCode}
- 관련 테스트: ${scout.relatedTests}
- 이번 요청으로 통과해야 하는 대상 테스트: ${scout.targetTests}
- 팀 통합 시나리오:
${scout.scenario}
`,
}
log(`사전 조사: ${task} (branch ${scout.branch}, 앱 ${scout.appRunning ? '실행 중' : '꺼짐'}) — ${scout.summary}`)

const rounds = []
let feedback = null
let outcome = null

for (let round = 1; round <= maxRounds; round++) {
  log(`라운드 ${round}/${maxRounds} 시작`)

  // prepare: 규칙 대조 → 사전 점검
  phase('Rule check')
  const rules = await agent(ruleCheckPrompt(round, ctx, feedback), { phase: 'Rule check', label: `rules r${round}`, schema: RULECHECK_SCHEMA, agentType: 'prepare' })
  if (!rules) { outcome = { outcome: 'ERROR', round, stage: 'rulecheck' }; break }
  log(`규칙 대조 r${round}: ${rules.verdict} (충돌 ${rules.conflicts.length}, 미결 ${rules.unresolved.length})`)

  phase('Precheck')
  const pre = await agent(precheckPrompt(round, ctx, feedback, rules), { phase: 'Precheck', label: `precheck r${round}`, schema: PRECHECK_SCHEMA, agentType: 'prepare' })
  if (!pre) { outcome = { outcome: 'ERROR', round, stage: 'precheck' }; break }
  log(`사전 점검 r${round}: ${pre.status} (${pre.riskSize}) → ${pre.htmlPath}`)
  rounds.push({ round, rules, pre })
  if (pre.status === 'HILP') {
    // Human-in-the-loop: 사람이 답해야 하므로 Loop 종료
    outcome = { outcome: 'HILP', round, reason: pre.reason, questions: pre.questions, precheck: pre.htmlPath, rules }
    break
  }

  // implement
  phase('Implement')
  const impl = await agent(implementPrompt(round, ctx, pre), { phase: 'Implement', label: `implement r${round}`, schema: IMPL_SCHEMA, agentType: 'implement' })
  if (!impl) { outcome = { outcome: 'ERROR', round, stage: 'implement' }; break }
  rounds[rounds.length - 1].impl = impl
  log(`구현 r${round}: ${impl.filesChanged.length}개 파일, JUnit ${impl.junitTotal - impl.junitFailed}/${impl.junitTotal}${impl.appRestarted ? ', 앱 재시작' : ''}`)

  // verify: 보안 ∥ 아키텍처 → 검증·리포트
  const [sec, arch] = await parallel([
    () => agent(securityPrompt(round, ctx, impl), { phase: 'Security', label: `security r${round}`, schema: SECURITY_SCHEMA, agentType: 'verify' }),
    () => agent(architecturePrompt(round, ctx, impl), { phase: 'Architecture', label: `architecture r${round}`, schema: ARCH_SCHEMA, agentType: 'verify' }),
  ])
  const secR = sec || { findings: [], checked: [], summary: '보안 점검 에이전트 결과 없음 (오류)' }
  const archR = arch || { violations: [], checked: [], layersOk: true, summary: '아키텍처 점검 에이전트 결과 없음 (오류)' }
  log(`보안 r${round}: 발견 ${secR.findings.length} / 아키텍처 r${round}: 위반 ${archR.violations.length}, layersOk=${archR.layersOk}`)

  phase('Verify')
  const rep = await agent(verifyPrompt(round, ctx, pre, impl, secR, archR), { phase: 'Verify', label: `verify r${round}`, schema: REPORT_SCHEMA, agentType: 'verify' })
  if (!rep) { outcome = { outcome: 'ERROR', round, stage: 'verify' }; break }
  Object.assign(rounds[rounds.length - 1], { sec: secR, arch: archR, rep })
  log(`검증 r${round}: ${rep.verdict} / ${rep.loop_action} — JUnit ${rep.junitFailed} 실패, E2E ${rep.e2eFailed} 실패(known-issue ${rep.e2eKnownIssueFailed}) → ${rep.htmlPath}`)

  if (rep.verdict === 'PASS') {
    // Loop 종료: prepare / implement / verify 가 한 일을 정리한 최종 Report (docs/logs/reports/report_*.HTML)
    phase('Report')
    const fin = await agent(finalReportPrompt(ctx, rounds, rounds[rounds.length - 1]), { phase: 'Report', label: 'final report', schema: FINAL_SCHEMA, agentType: 'verify' })
    if (fin) log(`최종 리포트: ${fin.reportHtmlPath}`)
    outcome = {
      outcome: 'PASS', round, precheck: fin ? fin.finalPrecheck : pre.htmlPath, report: fin ? fin.finalReport : rep.htmlPath,
      finalReportHtml: fin ? fin.reportHtmlPath : null, reviewLog: rep.reviewLogPath || null,
      filesChanged: impl.filesChanged, summary: rep.summary, security: secR.summary, architecture: archR.summary,
    }
    break
  }
  // Feedback Loop: 실패 원인을 들고 prepare 로 돌아간다
  feedback = { summary: rep.summary, failed_checklist: rep.failed_checklist, failed_tests: rep.failed_tests, suggested_focus: rep.suggested_focus }
  if (round === maxRounds) {
    outcome = { outcome: 'FAIL', round, reason: `최대 라운드(${maxRounds}) 초과`, lastReport: rep.htmlPath, feedback }
  }
}

return {
  task, request, evidenceDir, ...outcome,
  rounds: rounds.map(r => ({
    round: r.round,
    rules: r.rules && r.rules.verdict,
    precheck: r.pre && r.pre.status,
    implemented: !!r.impl,
    security: r.sec ? r.sec.findings.length : null,
    architecture: r.arch ? r.arch.violations.length : null,
    verdict: r.rep ? r.rep.verdict : null,
  })),
}
