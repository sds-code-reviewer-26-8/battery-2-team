(function () {
	renderHeader('new');

	const totalInput = document.getElementById('total');
	const gaugesEl = document.getElementById('gauges');
	const inputError = document.getElementById('inputError');
	const runBtn = document.getElementById('runBtn');
	const resultEl = document.getElementById('result');
	const optionsEl = document.getElementById('options');
	const confirmBtn = document.getElementById('confirmBtn');
	const confirmError = document.getElementById('confirmError');
	const dueAsap = document.getElementById('dueAsap');
	const dueDate = document.getElementById('dueDate');

	const MIN_DUE_DAYS = 5;            // 서버(OrderService)와 같은 범위
	const MAX_DUE_DAYS = 50;

	let master = null;                 // 게이지 옆 방문 횟수 표시용
	let values = {};                   // 나라별 주문 수량(K)
	let total = parseInt(totalInput.value, 10) || 12000;
	let result = null;                 // 마지막 시뮬레이션 결과
	let selected = 'COST';
	let anim = null;

	// ---- 게이지

	function even(sum) {
		const base = Math.floor(sum / FACTORY_ORDER.length);
		let rest = sum - base * FACTORY_ORDER.length;
		const v = {};
		FACTORY_ORDER.forEach(c => {
			v[c] = base + (rest > 0 ? 1 : 0);
			if (rest > 0) rest--;
		});
		return v;
	}

	function buildGauges() {
		gaugesEl.innerHTML = FACTORY_ORDER.map(c => `
			<div class="gauge" data-c="${c}">
				<input type="number" class="gnum" min="0" step="1">
				<input type="range" class="grange" min="0" step="1" orient="vertical">
				<div class="gname">${COUNTRY_LABEL[c]}</div>
				<div class="gvisits"></div>
			</div>`).join('');
		gaugesEl.querySelectorAll('.gauge').forEach(g => {
			const c = g.dataset.c;
			g.querySelector('.grange').addEventListener('input', e => move(c, parseInt(e.target.value, 10)));
			g.querySelector('.gnum').addEventListener('change', e => {
				const v = parseInt(e.target.value, 10);
				move(c, isNaN(v) ? values[c] : v);
			});
		});
		refreshGauges();
	}

	/** c 의 수량을 바꾸면 바로 오른쪽 나라가 반대로 조정된다(맨 오른쪽은 맨 왼쪽). 합계는 그대로. */
	function move(c, wanted) {
		const i = FACTORY_ORDER.indexOf(c);
		const neighbor = FACTORY_ORDER[(i + 1) % FACTORY_ORDER.length];
		const pair = values[c] + values[neighbor];
		const next = Math.max(0, Math.min(pair, wanted));
		values[c] = next;
		values[neighbor] = pair - next;
		refreshGauges();
		invalidate();
	}

	function refreshGauges() {
		gaugesEl.querySelectorAll('.gauge').forEach(g => {
			const c = g.dataset.c;
			g.querySelector('.gnum').value = values[c];
			const range = g.querySelector('.grange');
			range.max = total;
			range.value = values[c];
			const f = master && master.factories.find(x => x.country === c);
			g.querySelector('.gvisits').textContent = f && values[c] > 0
				? `방문 ${Math.ceil(values[c] / f.stockLimit)}회` : '방문 0회';
		});
	}

	totalInput.addEventListener('change', () => {
		const v = parseInt(totalInput.value, 10);
		if (!(v >= 1)) {
			totalInput.value = total;
			return;
		}
		total = v;
		values = even(total);
		refreshGauges();
		invalidate();
	});

	/** 입력이 바뀌면 이전 시뮬레이션 결과는 더 이상 이 입력의 결과가 아니다 */
	function invalidate() {
		result = null;
		resultEl.hidden = true;
		inputError.hidden = true;
	}

	// ---- 필요 납기

	/** 브라우저 로컬 날짜 기준 오늘 + days 를 yyyy-MM-dd 로 (UTC 로 바꾸지 않는다) */
	function localDate(days) {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() + days);
		const p = n => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}

	/** 오늘부터 납기일까지의 일수. '가능한 빨리'이거나 날짜가 비었으면 null */
	function dueDays() {
		if (dueAsap.checked || !dueDate.value) return null;
		const [y, m, d] = dueDate.value.split('-').map(Number);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return Math.round((new Date(y, m - 1, d) - today) / 86400000);
	}

	/** 화면에서 먼저 확인한다. 문제가 없으면 null, 있으면 이유 */
	function dueProblem() {
		if (dueAsap.checked) return null;
		if (!dueDate.value) return "필요 납기일을 선택하거나 '가능한 빨리'를 체크하세요";
		const days = dueDays();
		if (days < MIN_DUE_DAYS || days > MAX_DUE_DAYS) {
			return `필요 납기일은 오늘부터 ${MIN_DUE_DAYS}~${MAX_DUE_DAYS}일 사이로 선택하세요`;
		}
		return null;
	}

	/** 납기 조건이 바뀌면 시뮬레이션은 그대로 두고 결과 표시(납기 초과)만 다시 그린다 */
	function onDueChange() {
		dueDate.disabled = dueAsap.checked;
		if (!dueAsap.checked && !dueDate.value) dueDate.value = dueDate.min;
		confirmError.hidden = true;
		if (result) renderOptions();
	}

	dueDate.min = localDate(MIN_DUE_DAYS);
	dueDate.max = localDate(MAX_DUE_DAYS);
	dueAsap.addEventListener('change', onDueChange);
	dueDate.addEventListener('input', onDueChange);
	dueDate.addEventListener('change', onDueChange);

	// ---- 시뮬레이션

	function showError(el, msg) {
		el.textContent = msg;
		el.hidden = false;
	}

	runBtn.addEventListener('click', async () => {
		inputError.hidden = true;
		confirmError.hidden = true;
		runBtn.disabled = true;
		try {
			result = await postJson('/api/simulate', {orders: values});
			master = result.master;
			refreshGauges();
			selected = 'COST';
			renderResult(true);
			resultEl.hidden = false;
			resultEl.scrollIntoView({behavior: 'smooth', block: 'start'});
		} catch (e) {
			result = null;
			resultEl.hidden = true;
			showError(inputError, e.message);
		} finally {
			runBtn.disabled = false;
		}
	});

	function currentStored() {
		const plan = result.options.find(o => o.type === selected);
		return {master: result.master, orders: result.orders, visits: result.visits, plan};
	}

	/** 경로안 3개. 총 소요일이 납기 일수를 넘는 안은 빨간색과 '납기 초과'로 표시한다(확정은 막지 않는다). */
	function renderOptions() {
		optionsEl.innerHTML = result.options.map(o => `
			<button type="button" class="option ${o.type === selected ? 'selected' : ''}" data-type="${o.type}">
				<strong>${o.label}</strong>
				<span>소요 ${o.totalDays}일</span>
				<span>총 비용 ${eok(o.totalCost)}억원</span>
				<span class="muted">운항비 ${eok(o.shippingCost)}억원 · 배 ${o.ships.length}척</span>
			</button>`).join('');
		const days = dueProblem() ? null : dueDays();
		optionsEl.querySelectorAll('.option').forEach(b => {
			const o = result.options.find(x => x.type === b.dataset.type);
			if (days != null && o.totalDays > days) {
				b.classList.add('over-due');
				b.append(h('span', {class: 'due-tag'}, `납기 초과 (납기 ${days}일)`));
			}
			b.addEventListener('click', () => {
				selected = b.dataset.type;
				renderResult(false);
			});
		});
	}

	function renderResult(first) {
		renderOptions();

		const stored = currentStored();
		PlanView.renderSummary(document.getElementById('summary'), stored);
		PlanView.renderDetails(document.getElementById('details'), stored);
		const animRoot = document.getElementById('anim');
		if (!anim) {
			anim = BatteryAnim.mount(animRoot, stored, {autoplay: true});
		} else {
			anim.update(stored, true);
		}
	}

	// ---- 주문 확정

	confirmBtn.addEventListener('click', async () => {
		if (!result) return;
		confirmError.hidden = true;
		const problem = dueProblem();
		if (problem) {
			showError(confirmError, problem);
			return;
		}
		confirmBtn.disabled = true;
		try {
			const res = await postJson('/api/orders', {
				orders: values,
				routeType: selected,
				masterVersion: result.master.version,
				memo: document.getElementById('memo').value,
				asap: dueAsap.checked,
				dueDate: dueAsap.checked ? null : dueDate.value
			});
			location.href = '/orders/' + res.id;
		} catch (e) {
			showError(confirmError, e.message);
			confirmBtn.disabled = false;
		}
	});

	// ---- 시작

	values = even(total);
	buildGauges();
	getJson('/api/master').then(m => {
		master = m;
		refreshGauges();
	}).catch(() => { /* 방문 횟수 표시만 비어 있게 둔다 */ });
})();
