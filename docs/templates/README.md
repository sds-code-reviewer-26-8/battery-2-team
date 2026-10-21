# HTML 템플릿

데이터(JSON)만 채우면 같은 디자인의 점검·리포트 페이지가 만들어지는 템플릿입니다.
각 템플릿은 **단일 HTML 파일**(외부 라이브러리 없음, 라이트/다크 모드, 모바일 폭 지원)이고, 데이터는 `<script id="data" type="application/json">` 한 곳에만 들어갑니다.

| 템플릿 | 용도 | 교체할 자리 |
|---|---|---|
| `precheck.template.html` | 구현 전 **사전 점검** 페이지 (배경·목적 이해, 위험, 테스트 케이스, 체크리스트 3개, 계획) | `__PRECHECK_DATA__` |
| `report.template.html` | 구현 후 **검증 리포트** 페이지 (체크리스트 결과, 회귀 테스트, 문제, 되돌아갈 값) | `__REPORT_DATA__` |

## 사용법
1. 템플릿을 복사한다.
2. 위 표의 자리(`__..._DATA__`) **한 곳**을 아래 JSON 문자열로 교체한다. 다른 부분은 바꾸지 않는다.
3. JSON 문자열 안의 `<` 는 `\u003c` 로 바꿔서 넣는다. 데이터에 `</script>` 같은 글이 있어도 페이지가 깨지지 않게 하기 위해서다.
4. 저장한 HTML 을 브라우저로 연다.

화면에는 `textContent` 로만 값을 넣으므로, 데이터에 HTML 태그가 있어도 실행되지 않고 글자로 보인다.

## precheck 데이터

```json
{
  "request": "요청 한 줄 요약",
  "round": 1,
  "status": "READY | HILP",
  "reason": "HILP 사유 (READY 면 빈 문자열)",
  "questions": ["HILP 일 때 사람이 답해야 할 질문"],
  "background": {"understood": true, "summary": "", "evidence": [""]},
  "purpose":    {"understood": true, "summary": "", "evidence": [""]},
  "risk": {
    "size": "small | medium | large",
    "severity": "low | medium | high",
    "userAware": true,
    "warning": "사용자에게 알릴 경고 (없으면 빈 문자열)",
    "items": [{"title": "", "detail": "", "severity": "low | medium | high"}]
  },
  "testCases": [{
    "id": "TC-1", "origin": "existing | new", "kind": "regression | boundary | feature",
    "target": "", "description": "", "input": "", "expected": ""
  }],
  "checklist": [{"title": "", "detail": ""}],
  "plan": "구현 계획 (HILP 면 빈 문자열)"
}
```

- `status` 가 `HILP` 이면 헤더가 주황·빨강으로 바뀌고 "사람이 답해야 할 질문" 카드가 맨 위에 나온다.
- `checklist` 는 구현 후 꼭 확인할 항목(3개 권장)이며, 화면에서 체크하면 진행률이 올라간다(브라우저에 저장).
- `testCases` 는 화면에서 기존/신규/회귀/경계값으로 거르고 검색할 수 있다.

## report 데이터

```json
{
  "request": "요청 한 줄 요약",
  "round": 1,
  "verdict": "PASS | FAIL",
  "loop_action": "END | RETRY",
  "summary": "판정 요약",
  "checklist": [{"title": "", "detail": "", "result": "pass | fail | unverified", "evidence": ""}],
  "regression": {
    "command": "", "total": 0, "passed": 0, "failed": 0, "skipped": 0, "duration": "",
    "tests": [{"suite": "", "name": "", "result": "pass | fail | skipped", "time": "", "message": ""}]
  },
  "e2e": {"ran": false, "note": ""},
  "issues": [{"severity": "blocker | major | minor", "location": "", "problem": "", "reproduce": ""}],
  "plan_feedback": {"summary": "", "failed_checklist": [""], "failed_tests": [""], "suggested_focus": [""]},
  "commands": [{"cmd": "", "result": ""}],
  "precheck_link": "사전 점검 페이지로 가는 상대 경로 (없으면 빈 문자열)"
}
```

- `verdict` 가 `FAIL` 이면 `plan_feedback` 이 "계획 단계로 되돌아가기 위한 값" 카드로 맨 위에 나온다.
- 회귀 테스트 표는 통과/실패/건너뜀으로 거르고 검색할 수 있다.
- `precheck_link` 가 있으면 "관련 산출물" 카드에 링크가 나온다.

## 수정할 때
- 데이터 구조(키 이름)를 바꾸면 이 문서와 템플릿의 렌더링 코드를 **함께** 고친다.
- 값은 반드시 `textContent` 로 넣는다(`innerHTML` 사용 금지).
