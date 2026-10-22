#!/usr/bin/env node
/**
 * 팀 HTML 템플릿(docs/templates)에 JSON 데이터를 끼워 점검/리포트 페이지를 만든다.
 *
 *   node docs/loops/ctkim1005/loop/render.mjs precheck <data.json> <out.html>
 *   node docs/loops/ctkim1005/loop/render.mjs report   <data.json> <out.html>
 *
 * - 템플릿의 자리(__PRECHECK_DATA__ / __REPORT_DATA__) 한 곳만 JSON 문자열로 바꾼다.
 * - JSON 안의 '<' 는 '<' 로 바꿔 </script> 가 들어 있어도 페이지가 깨지지 않게 한다. (docs/templates/README.md)
 * - 필수 키가 빠지면 실패시켜, 에이전트가 빈 페이지를 만들지 못하게 한다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

const KINDS = {
  precheck: {
    template: resolve(repoRoot, 'docs/templates/precheck.template.html'),
    placeholder: '__PRECHECK_DATA__',
    required: ['request', 'round', 'status', 'reason', 'questions', 'background', 'purpose', 'risk', 'testCases', 'checklist', 'plan'],
  },
  report: {
    template: resolve(repoRoot, 'docs/templates/report.template.html'),
    placeholder: '__REPORT_DATA__',
    required: ['request', 'round', 'verdict', 'loop_action', 'summary', 'checklist', 'regression', 'e2e', 'issues', 'plan_feedback', 'commands', 'precheck_link'],
  },
  // Loop 종료(PASS) 시 prepare/implement/verify 가 한 일을 짧게 정리한 최종 리포트 (docs/logs/reports/report_*.HTML)
  summary: {
    template: resolve(here, 'summary-report.template.html'),
    placeholder: '__SUMMARY_DATA__',
    required: ['title', 'task', 'request', 'verdict', 'roundCount', 'date', 'owner', 'tiles', 'stages', 'checklist', 'history', 'filesChanged', 'issues', 'links'],
  },
};

const [, , kind, dataPath, outPath] = process.argv;
const spec = KINDS[kind];
if (!spec || !dataPath || !outPath) {
  console.error('usage: node render.mjs <precheck|report|summary> <data.json> <out.html>');
  process.exit(2);
}
if (!existsSync(spec.template)) {
  console.error(`template not found: ${spec.template}`);
  process.exit(2);
}

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const missing = spec.required.filter((k) => !(k in data));
if (missing.length) {
  console.error(`missing keys for ${kind}: ${missing.join(', ')}`);
  process.exit(1);
}
if (kind === 'precheck' && !['READY', 'HILP'].includes(data.status)) {
  console.error(`precheck.status must be READY or HILP, got: ${data.status}`);
  process.exit(1);
}
if (kind === 'report' && (!['PASS', 'FAIL'].includes(data.verdict) || !['END', 'RETRY'].includes(data.loop_action))) {
  console.error(`report.verdict must be PASS|FAIL and loop_action END|RETRY, got: ${data.verdict}/${data.loop_action}`);
  process.exit(1);
}

const template = readFileSync(spec.template, 'utf8');
if (!template.includes(spec.placeholder)) {
  console.error(`placeholder ${spec.placeholder} not found in template`);
  process.exit(1);
}
const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
const html = template.replace(spec.placeholder, json);

mkdirSync(dirname(resolve(outPath)), { recursive: true });
writeFileSync(outPath, html, 'utf8');
console.log(`rendered ${kind} -> ${outPath} (${html.length} bytes)`);
