package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.controller.AuthController;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.ui.ExtendedModelMap;

/** 로그인 계정이 설정으로 바뀌는지 확인한다(서버를 띄우지 않고 컨트롤러만 만들어서 본다). */
class AuthControllerAccountTest {

	private final AuthController controller = new AuthController("boss", "s3cret");

	@Test
	void configuredAccountCanLogIn() {
		MockHttpSession session = new MockHttpSession();
		String view = controller.login("boss", "s3cret", session, new ExtendedModelMap());
		assertThat(view).isEqualTo("redirect:/orders");
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isEqualTo("boss");
	}

	@Test
	void defaultAccountIsNotAcceptedWhenAnotherOneIsConfigured() {
		MockHttpSession session = new MockHttpSession();
		ExtendedModelMap model = new ExtendedModelMap();
		assertThat(controller.login("admin", "admin", session, model)).isEqualTo("login");
		assertThat(model.get("error")).isEqualTo("아이디 또는 비밀번호가 올바르지 않습니다");
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isNull();
	}

	@Test
	void usernameAndPasswordMustBothMatch() {
		assertThat(controller.login("boss", "admin", new MockHttpSession(), new ExtendedModelMap())).isEqualTo("login");
		assertThat(controller.login("admin", "s3cret", new MockHttpSession(), new ExtendedModelMap())).isEqualTo("login");
	}
}
