(function () {
	const form = document.getElementById('signupForm');
	const alerts = document.getElementById('alerts');

	/** 이유가 여러 개일 수 있으므로 목록으로 보여 준다(마스터 화면과 같은 모양) */
	function showErrors(reasons) {
		setAlert(alerts, h('div', {class: 'alert error'}, h('strong', null, '가입하지 못했습니다.'),
			h('ul', null, ...reasons.map(r => h('li', null, r)))));
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
			// 입력한 값은 그대로 두고 이유만 알린다. 서버에 연결하지 못한 경우도 같은 방식으로 안내한다.
			const network = err instanceof TypeError;
			showErrors(network ? ['서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요']
				: err.errors && err.errors.length ? err.errors : [err.message]);
			return;
		}
		location.href = '/login?signedUp=1';
	});
})();
