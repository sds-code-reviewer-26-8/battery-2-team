(function () {
	const form = document.getElementById('signupForm');
	const alerts = document.getElementById('alerts');

	/** 이유가 여러 개일 수 있으므로 목록으로 보여 준다(마스터 화면과 같은 모양) */
	function showErrors(reasons) {
		setAlert(alerts, errorListAlert('가입하지 못했습니다.', reasons));
	}

	form.addEventListener('submit', async e => {
		e.preventDefault();
		setAlert(alerts, null);
		const body = {
			username: form.username.value,
			password: form.password.value,
			passwordConfirm: form.passwordConfirm.value,
			code: form.code.value
		};
		try {
			await postJson('/api/signup', body);
		} catch (err) {
			// 입력한 값은 그대로 두고 이유만 알린다. 서버에 연결하지 못한 경우도 이유(err.message)에 담겨 있다.
			showErrors(err.errors && err.errors.length ? err.errors : [err.message]);
			return;
		}
		location.href = '/login?signedUp=1';
	});
})();
