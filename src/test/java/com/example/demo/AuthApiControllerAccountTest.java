package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.controller.AuthApiController;
import com.example.demo.controller.AuthApiController.LoginRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;

/** 로그인 계정이 설정으로 바뀌는지, 로그인할 때 세션 ID 가 새로 발급되는지 확인한다(서버를 띄우지 않고 컨트롤러만 만들어서 본다). */
class AuthApiControllerAccountTest {

	private final AuthApiController controller = new AuthApiController("boss", "s3cret");

	private static MockHttpServletRequest requestWith(MockHttpSession session) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setSession(session);
		return request;
	}

	@Test
	void configuredAccountCanLogIn() {
		MockHttpSession session = new MockHttpSession();
		var res = controller.login(new LoginRequest("boss", "s3cret"), requestWith(session));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody()).containsEntry("username", "boss");
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isEqualTo("boss");
	}

	@Test
	void defaultAccountIsNotAcceptedWhenAnotherOneIsConfigured() {
		MockHttpSession session = new MockHttpSession();
		var res = controller.login(new LoginRequest("admin", "admin"), requestWith(session));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(res.getBody()).containsEntry("error", "아이디 또는 비밀번호가 올바르지 않습니다");
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isNull();
	}

	@Test
	void usernameAndPasswordMustBothMatch() {
		assertThat(controller.login(new LoginRequest("boss", "admin"), requestWith(new MockHttpSession())).getStatusCode())
				.isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(controller.login(new LoginRequest("admin", "s3cret"), requestWith(new MockHttpSession())).getStatusCode())
				.isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/** 로그인 전에 알려진 세션 ID 로 로그인 상태를 가로채지 못하도록(세션 고정), 로그인에 성공하면 세션 ID 가 바뀐다. */
	@Test
	void successfulLoginIssuesANewSessionId() {
		MockHttpSession session = new MockHttpSession();
		String before = session.getId();
		controller.login(new LoginRequest("boss", "s3cret"), requestWith(session));
		assertThat(session.getId()).isNotEqualTo(before);
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isEqualTo("boss");
	}

	@Test
	void failedLoginKeepsTheSessionId() {
		MockHttpSession session = new MockHttpSession();
		String before = session.getId();
		controller.login(new LoginRequest("boss", "wrong"), requestWith(session));
		assertThat(session.getId()).isEqualTo(before);
	}
}
