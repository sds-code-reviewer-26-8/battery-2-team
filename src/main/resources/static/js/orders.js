(function () {
	renderHeader('orders');

	const filtersEl = document.getElementById('filters');
	const rowsEl = document.getElementById('rows');
	const alerts = document.getElementById('alerts');
	const status = new URLSearchParams(location.search).get('status');

	function chip(href, label, count, active) {
		return h('a', {href, class: 'chip' + (active ? ' active' : '')}, label, ' ', h('span', {class: 'count'}, count));
	}

	function row(o) {
		const go = () => { location.href = '/orders/' + o.id; };
		const tr = h('tr', {class: 'clickable'},
			h('td', null, h('a', {href: '/orders/' + o.id}, '#' + o.id)),
			h('td', null, o.confirmedAt),
			h('td', {class: 'num'}, fmt(o.totalK)),
			h('td', null, o.routeLabel),
			h('td', {class: 'num'}, o.totalDays),
			h('td', {class: 'num'}, o.operatingCostEok),
			h('td', {class: 'num'}, o.totalCostEok),
			h('td', null, h('span', {class: 'badge badge-' + o.status.name}, o.status.label)),
			h('td', null, o.createdBy));
		tr.addEventListener('click', go);
		return tr;
	}

	function render(data) {
		filtersEl.replaceChildren(
			chip('/orders', '전체', data.total, !status),
			...data.statuses.map(s => chip('/orders?status=' + s.name, s.label, data.counts[s.name], status === s.name)));
		rowsEl.replaceChildren(...(data.orders.length
			? data.orders.map(row)
			: [h('tr', null, h('td', {colspan: 9, class: 'empty'}, '주문이 없습니다.'))]));
	}

	getJson('/api/orders' + (status ? '?status=' + encodeURIComponent(status) : '')).then(render).catch(e => {
		setAlert(alerts, errorAlert(e.message));
	});
})();
