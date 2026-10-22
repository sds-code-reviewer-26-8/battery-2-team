package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.controller.AuthApiController;
import com.example.demo.controller.AuthApiController.LoginRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;

/** 로그인 계정이 설정으로 바뀌는지 확인한다(서버를 띄우지 않고 컨트롤러만 만들어서 본다). */
class AuthApiControllerAccountTest {

	private final AuthApiController controller = new AuthApiController("boss", "s3cret");

	@Test
	void configuredAccountCanLogIn() {
		MockHttpSession session = new MockHttpSession();
		var res = controller.login(new LoginRequest("boss", "s3cret"), session);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody()).containsEntry("username", "boss");
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isEqualTo("boss");
	}

	@Test
	void defaultAccountIsNotAcceptedWhenAnotherOneIsConfigured() {
		MockHttpSession session = new MockHttpSession();
		var res = controller.login(new LoginRequest("admin", "admin"), session);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(res.getBody()).containsEntry("error", "아이디 또는 비밀번호가 올바르지 않습니다");
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isNull();
	}

	@Test
	void usernameAndPasswordMustBothMatch() {
		assertThat(controller.login(new LoginRequest("boss", "admin"), new MockHttpSession()).getStatusCode())
				.isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(controller.login(new LoginRequest("admin", "s3cret"), new MockHttpSession()).getStatusCode())
				.isEqualTo(HttpStatus.UNAUTHORIZED);
	}
}
