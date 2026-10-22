(function () {
	renderHeader('master');

	const COUNTRIES = ['KOREA', ...FACTORY_ORDER];
	const form = document.getElementById('masterForm');
	const body = document.getElementById('masterBody');
	const alerts = document.getElementById('alerts');
	const saveBtn = document.getElementById('saveBtn');

	function input(name, values, attrs) {
		return h('input', {name, value: values[name], ...attrs});
	}

	function factoryTable(values) {
		return h('section', {class: 'card'}, h('h2', null, '공장'),
			h('table', {class: 'grid'},
				h('thead', null, h('tr', null, ...['나라', '하루 최대 생산량(K)', '재고 상한(K)', '셀당 원가(원)'].map(t => h('th', null, t)))),
				h('tbody', null, ...FACTORY_ORDER.map(c => h('tr', null,
					h('td', null, COUNTRY_LABEL[c]),
					h('td', null, input('maxDaily_' + c, values, {type: 'number', min: 1})),
					h('td', null, input('stockLimit_' + c, values, {type: 'number', min: 1})),
					h('td', null, input('unitCost_' + c, values, {type: 'number', min: 1})))))));
	}

	function shipSection(values) {
		return h('section', {class: 'card'}, h('h2', null, '선박'),
			h('div', {class: 'row'},
				h('label', null, '배 척수 (1~4) ', input('shipCount', values, {type: 'number', min: 1, max: 4})),
				h('label', null, '척당 일 운항비(억 원) ', input('shipDailyCost', values, {type: 'text', inputmode: 'decimal'}))));
	}

	/** 항로 표: 항해 일수는 양방향 같으므로 오른쪽 위 칸만 입력칸이다 */
	function routeMatrix(values) {
		return h('section', {class: 'card'}, h('h2', null, '항로 (항해 일수, 양방향 동일)'),
			h('table', {class: 'grid matrix'},
				h('thead', null, h('tr', null, h('th'), ...COUNTRIES.slice(1).map(c => h('th', null, COUNTRY_LABEL[c])))),
				h('tbody', null, ...COUNTRIES.slice(0, -1).map((a, ai) => h('tr', null,
					h('th', null, COUNTRY_LABEL[a]),
					...COUNTRIES.slice(1).map((b, bi) => bi + 1 > ai
						? h('td', null, input('days_' + a + '_' + b, values, {type: 'number', min: 1}))
						: h('td', null, h('span', {class: 'muted'}, '-'))))))));
	}

	function render(values) {
		body.replaceChildren(factoryTable(values), shipSection(values), routeMatrix(values));
		saveBtn.disabled = false;
	}

	function showErrors(e) {
		const reasons = e.errors && e.errors.length ? e.errors : [e.message];
		setAlert(alerts, h('div', {class: 'alert error'}, h('strong', null, '저장하지 않았습니다. 아래 값을 확인하세요.'),
			h('ul', null, ...reasons.map(r => h('li', null, r)))));
	}

	form.addEventListener('submit', async e => {
		e.preventDefault();
		setAlert(alerts, null);
		const values = {};
		form.querySelectorAll('input[name]').forEach(i => { values[i.name] = i.value; });
		let res;
		try {
			res = await postJson('/api/master', values);
		} catch (err) {
			showErrors(err);   // 입력한 값은 그대로 두고 이유만 알린다
			return;
		}
		// 여기부터는 저장이 끝난 상태다. 저장된 값(쉼표 제거 등)을 다시 읽어 보여 주고,
		// 읽기에 실패해도 "저장하지 않았습니다"로 알리지 않는다.
		try {
			render(await getJson('/api/master/form'));
			setAlert(alerts, okAlert(res.message));
		} catch (err) {
			setAlert(alerts, okAlert(res.message + ' 다만 저장된 값을 화면에 다시 불러오지 못했습니다. 화면을 새로 고쳐 확인하세요.'));
		}
	});

	getJson('/api/master/form').then(render).catch(showErrors);
})();
