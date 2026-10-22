(function () {
	const form = document.getElementById('loginForm');
	const alerts = document.getElementById('alerts');

	form.addEventListener('submit', async e => {
		e.preventDefault();
		setAlert(alerts, null);
		// 로그인 실패(401)는 "로그인이 필요합니다" 이동이 아니라 이 화면의 안내이므로 requestJson 을 쓰지 않는다
		let res;
		try {
			res = await fetch('/api/login', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({username: form.username.value, password: form.password.value})
			});
		} catch (err) {
			setAlert(alerts, errorAlert('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'));   // 서버 중단 등 네트워크 오류
			return;
		}
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
