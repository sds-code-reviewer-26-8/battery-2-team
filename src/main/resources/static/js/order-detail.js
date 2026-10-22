(function () {
	renderHeader('orders');

	const id = location.pathname.split('/').pop();
	const $ = name => document.getElementById(name);
	let planShown = false;

	function renderActions(order) {
		if (!order.nextStatuses.length) {
			$('actions').replaceChildren(h('p', {class: 'muted'}, '최종 상태라 더 바꿀 수 없습니다.'));
			return;
		}
		$('actions').replaceChildren(h('div', {class: 'actions'}, ...order.nextStatuses.map(s => {
			const form = h('form', {class: 'status-form', 'data-confirm': s.label + '(으)로 바꿉니다. 계속할까요?'},
				h('input', {type: 'hidden', name: 'status', value: s.name}),
				h('input', {type: 'hidden', name: 'version', value: order.version}),
				h('button', {type: 'submit', class: s.name === 'CANCELED' ? 'danger' : 'primary'}, s.label + '(으)로 변경'));
			form.addEventListener('submit', e => {
				e.preventDefault();
				if (confirm(form.dataset.confirm)) changeStatus(s.name, order.version);
			});
			return form;
		})));
	}

	function renderCustomer(order) {
		if (!order.customerEditable) {
			$('customer').replaceChildren(h('p', {class: 'muted'}, '완료 또는 취소된 주문은 고객사를 수정할 수 없습니다.'));
			return;
		}
		const input = h('input', {type: 'text', id: 'customerInput', maxlength: '100', value: order.customerName || '', 'aria-label': '고객사 이름'});
		const form = h('form', {class: 'customer-form'}, input,
			h('button', {type: 'submit', class: 'primary'}, '저장'));
		form.addEventListener('submit', e => {
			e.preventDefault();
			changeCustomer(input.value, order.version);
		});
		$('customer').replaceChildren(form);
	}

	function render(order) {
		$('title').replaceChildren('주문 ', h('span', null, '#' + order.id), ' ',
			h('span', {class: 'badge badge-' + order.status.name}, order.status.label));
		$('meta').replaceChildren(
			...[['확정 일시', order.confirmedAt], ['작성자', order.createdBy], ['경로', order.routeLabel], ['고객사', order.customerName != null ? order.customerName : '-'],
				['메모', order.memo != null ? order.memo : '-']].map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))));
		renderCustomer(order);
		renderActions(order);
		$('history').replaceChildren(...order.history.map(r => h('tr', null,
			h('td', null, r.changedAt), h('td', null, r.from ? r.from.label : '-'), h('td', null, r.to.label),
			h('td', null, r.changedBy))));
		// 계획은 확정 때 저장된 값이라 상태가 바뀌어도 달라지지 않으므로 처음 한 번만 그린다
		if (!planShown) {
			planShown = true;
			PlanView.renderSummary($('summary'), order.plan);
			PlanView.renderDetails($('details'), order.plan);
			BatteryAnim.mount($('anim'), order.plan, {autoplay: false});
		}
		$('content').hidden = false;
	}

	/** 주문을 다시 불러와 그린다. flash 는 맨 위에 보여 줄 안내({ok} 또는 {error}) */
	async function load(flash) {
		setAlert($('flash'), null);
		try {
			render(await getJson('/api/orders/' + encodeURIComponent(id)));
		} catch (e) {
			$('content').hidden = true;
			setAlert($('pageAlerts'), errorAlert(e.message));
			return;
		}
		if (flash && flash.ok) setAlert($('flash'), okAlert(flash.ok));
		if (flash && flash.error) setAlert($('flash'), errorAlert(flash.error));
	}

	async function changeStatus(status, version) {
		try {
			const res = await postJson('/api/orders/' + encodeURIComponent(id) + '/status', {status, version});
			await load({ok: res.message});
		} catch (e) {
			// 충돌이면 그 사이 바뀐 현재 상태를 함께 보여 준다
			await load({error: e.message});
		}
	}

	async function changeCustomer(customerName, version) {
		try {
			const res = await postJson('/api/orders/' + encodeURIComponent(id) + '/customer', {customerName, version});
			await load({ok: res.message});
		} catch (e) {
			await load({error: e.message});
		}
	}

	load();
})();
