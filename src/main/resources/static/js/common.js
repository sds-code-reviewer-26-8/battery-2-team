const COUNTRY_LABEL = {KOREA: '한국', CHINA: '중국', JAPAN: '일본', VIETNAM: '베트남', INDONESIA: '인도네시아'};
const FACTORY_ORDER = ['CHINA', 'JAPAN', 'VIETNAM', 'INDONESIA'];

/** 천 단위 쉼표 */
const fmt = n => Number(n).toLocaleString('ko-KR');

/** 원 → 억원(소수 2자리) */
const eok = won => (won / 1e8).toFixed(2);

/**
 * 요소를 만든다. h('a', {href: '/orders', class: 'chip'}, '목록') 처럼 쓴다.
 * 글자는 textContent 로 넣으므로 서버에서 온 값(메모, 작성자 등)이 HTML 로 해석되지 않는다.
 */
function h(tag, attrs, ...children) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs || {})) {
		if (v === false || v == null) continue;
		el.setAttribute(k, v === true ? '' : v);
	}
	for (const c of children.flat()) {
		if (c == null || c === false) continue;
		el.append(c instanceof Node ? c : document.createTextNode(String(c)));
	}
	return el;
}

/**
 * 안내 상자를 container 안에 하나만 둔다. alert 가 null 이면 비운다.
 * 숨기지 않고 아예 없애서, 안내가 없을 때는 화면에 .alert 요소가 하나도 없게 한다.
 */
function setAlert(container, alert) {
	container.replaceChildren(...(alert ? [alert] : []));
}

const okAlert = text => h('p', {class: 'alert ok'}, text);
const errorAlert = text => h('p', {class: 'alert error'}, text);

/**
 * JSON 요청. 실패하면 서버가 준 이유(error)를 담은 Error 를 던진다.
 * 로그인이 풀렸으면(401) 로그인 화면으로 보낸다.
 */
async function requestJson(method, url, body) {
	const res = await fetch(url, {
		method,
		headers: body === undefined ? {} : {'Content-Type': 'application/json'},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	let data = null;
	try {
		data = await res.json();
	} catch (e) { /* 본문 없음 */ }
	if (res.status === 401) {
		location.href = '/login';
		throw new Error('로그인이 필요합니다');
	}
	if (!res.ok) {
		const err = new Error((data && data.error) || '요청에 실패했습니다');
		err.conflict = !!(data && data.conflict);
		err.errors = (data && data.errors) || [];
		throw err;
	}
	return data;
}

const getJson = url => requestJson('GET', url);
const postJson = (url, body) => requestJson('POST', url, body);

/** 모든 화면 위쪽의 메뉴. active 는 현재 메뉴('orders' | 'new' | 'master') */
function renderHeader(active) {
	const link = (key, href, text) => h('a', {href, class: active === key ? 'active' : null}, text);
	const userName = h('span');
	const logout = h('button', {type: 'submit', class: 'link'}, '로그아웃');
	const logoutForm = h('form', null, logout);
	logoutForm.addEventListener('submit', async e => {
		e.preventDefault();
		await fetch('/api/logout', {method: 'POST'});
		location.href = '/login';
	});
	document.getElementById('topbar').replaceChildren(
		h('a', {class: 'brand', href: '/orders'}, '배터리 주문 관리'),
		h('nav', null, link('orders', '/orders', '주문 목록'), link('new', '/orders/new', '주문 추가'),
			link('master', '/master', '마스터 데이터')),
		h('div', {class: 'user'}, userName, logoutForm));
	getJson('/api/me').then(me => {
		userName.textContent = me.username;
	}).catch(() => { /* 로그인 화면으로 이동 중이거나 사용자 이름만 비어 있게 둔다 */ });
}
