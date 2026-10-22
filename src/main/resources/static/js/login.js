(function () {
	const form = document.getElementById('loginForm');
	const alerts = document.getElementById('alerts');

	form.addEventListener('submit', async e => {
		e.preventDefault();
		setAlert(alerts, null);
		// 로그인 실패(401)는 "로그인이 필요합니다" 이동이 아니라 이 화면의 안내이므로 requestJson 을 쓰지 않는다
		const res = await fetch('/api/login', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({username: form.username.value, password: form.password.value})
		});
		if (res.ok) {
			location.href = '/orders';
			return;
		}
		let message = '로그인에 실패했습니다';
		try {
			message = (await res.json()).error || message;
		} catch (err) { /* 본문 없음 */ }
		setAlert(alerts, errorAlert(message));
	});
})();
