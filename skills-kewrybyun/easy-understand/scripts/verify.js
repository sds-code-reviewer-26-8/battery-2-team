// 사용법: node verify.js <guide.html> <prototype.html>
const { JSDOM } = require(require.resolve('jsdom', { paths: [process.cwd()] })); // jsdom 을 설치한 폴더에서 실행
const fs = require('fs');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const load = f => {
  const errs = [];
  const dom = new JSDOM(fs.readFileSync(f, 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) { w.addEventListener('error', e => errs.push(e.message)); w.HTMLElement.prototype.scrollIntoView = () => {}; }
  });
  return { w: dom.window, d: dom.window.document, errs };
};
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const text = el => el.textContent.replace(/\s+/g, ' ').trim();

// ---------------- 가이드
{
  const { w, d, errs } = load(process.argv[2]);
  ok(errs.length === 0, '가이드: 스크립트 오류 없음 ' + errs.join('|'));
  ok(d.querySelectorAll('#flow .step').length === 5, '가이드: 흐름도 5단계');
  click(w, d.querySelectorAll('#flow .step')[3]);
  ok(text(d.getElementById('flowDetail')).includes('진행'), '가이드: 흐름도 클릭 시 설명 변경');
  click(w, d.getElementById('next'));
  ok(d.querySelectorAll('.panel')[1].classList.contains('on'), '가이드: 다음 → 2탭');
  const qty = d.getElementById('qty'); qty.value = 9000; qty.dispatchEvent(new w.Event('input'));
  ok(text(d.getElementById('rVisits')) !== '', '가이드: 슬라이더 → 방문 횟수 ' + text(d.getElementById('rVisits')));
  click(w, d.getElementById('next'));
  const btns = [...d.querySelectorAll('#stateBtns button')];
  const cancel = btns.find(b => b.textContent.includes('취소'));
  ok(btns.find(b => b.textContent.includes('완료')).disabled, '가이드: 확정→완료 불가(버튼 비활성)');
  click(w, cancel);
  ok(text(d.getElementById('stateLog')).includes('삭제'), '가이드: 취소 시 삭제 안내 표시');
}

// ---------------- 프로토타입
{
  const { w, d, errs } = load(process.argv[3]);
  ok(errs.length === 0, '프로토타입: 스크립트 오류 없음 ' + errs.join('|'));
  const rows = () => d.querySelectorAll('#orderRows tr.click');
  ok(rows().length >= 2, '프로토타입: Mock 주문 ' + rows().length + '건 표시');
  console.log('   ' + [...rows()].map(text).join('\n   '));
  ok([...rows()].every(r => !/NaN|undefined/.test(r.textContent)), '프로토타입: 목록에 NaN/undefined 없음');
  click(w, rows()[0]);
  ok(!d.getElementById('detail').classList.contains('hide') && /생산 .* 운항/.test(text(d.getElementById('detail'))), '프로토타입: 상세에 비용 내역');
  // 새 주문
  click(w, d.querySelector('nav button[data-v=new]'));
  const inp = d.querySelector('#qtyInputs input[data-c=중국]'); inp.value = 9000;
  click(w, d.getElementById('simBtn'));
  const opts = d.querySelectorAll('#options .opt');
  ok(opts.length === 3, '프로토타입: 계획 3가지 ' + [...opts].map(text).join(' / '));
  ok([...opts].every(o => !/NaN|undefined/.test(o.textContent)), '프로토타입: 계획 카드에 NaN 없음');
  click(w, d.getElementById('confirmBtn'));
  ok(/선택/.test(d.getElementById('confMsg').textContent), '프로토타입: 미선택 확정 거부');
  click(w, opts[0]); click(w, d.getElementById('confirmBtn'));
  const before = rows().length;
  ok(before === 3 && /확정/.test(text(rows()[0])), '프로토타입: 확정 후 목록 3건, 새 주문=확정');
  // 상태 변경 → 취소하면 삭제
  const dBtns = [...d.querySelectorAll('#dBtns button')];
  click(w, dBtns.find(b => b.textContent.includes('진행')));
  ok(/진행/.test(text(rows()[0])), '프로토타입: 확정→진행');
  click(w, [...d.querySelectorAll('#dBtns button')].find(b => b.textContent.includes('취소')));
  ok(rows().length === before - 1, '프로토타입: 취소하면 목록에서 삭제');
  // 총량 상한, 빈 입력
  click(w, d.querySelector('nav button[data-v=new]'));
  d.querySelector('#qtyInputs input[data-c=중국]').value = 100001;
  click(w, d.getElementById('simBtn'));
  ok(/100,000/.test(d.getElementById('simMsg').textContent), '프로토타입: 총량 상한 검사');
  // 기준 정보
  click(w, d.querySelector('nav button[data-v=master]'));
  ok(d.querySelectorAll('#mRows tr').length === 4, '프로토타입: 기준 정보 4개 공장');
  click(w, d.getElementById('saveMaster'));
  ok(/저장/.test(d.getElementById('mMsg').textContent), '프로토타입: 기준 정보 저장');
}
console.log(fail ? `\n${fail}개 실패` : '\n모두 통과');
process.exit(fail ? 1 : 0);
