(function () {
	const form = document.getElementById('loginForm');
	const alerts = document.getElementById('alerts');

	// 가입을 마치고 넘어왔으면 안내를 보여 준다
	if (new URLSearchParams(location.search).get('signedUp') === '1') {
		setAlert(alerts, okAlert('가입했습니다. 로그인해 주세요'));
	}

	form.addEventListener('submit', async e => {
		e.preventDefault();
		setAlert(alerts, null);
		try {
			// 로그인 실패(401)는 "로그인이 필요합니다" 이동이 아니라 이 화면의 안내이므로 이동하지 않게 한다
			await postJson('/api/login', {username: form.username.value, password: form.password.value},
				{redirectOn401: false});
		} catch (err) {
			setAlert(alerts, errorAlert(err.message));   // 틀린 아이디·비밀번호, 서버 연결 실패 모두 이유가 담겨 있다
			return;
		}
		location.href = '/orders';
	});
})();
