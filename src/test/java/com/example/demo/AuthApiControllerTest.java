package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.controller.AuthApiController;
import com.example.demo.controller.AuthApiController.LoginRequest;
import com.example.demo.service.MemberService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;

/** 로그인 처리를 컨트롤러에서 직접 확인한다: 세션에 담기는 값, 세션 ID 재발급. 회원은 실제 DB 에 가입시켜 쓴다. */
@SpringBootTest
@AutoConfigureMockMvc
class AuthApiControllerTest {

	@Autowired
	AuthApiController controller;
	@Autowired
	MemberService members;

	private static MockHttpServletRequest requestWith(MockHttpSession session) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setSession(session);
		return request;
	}

	private String newMember() {
		String name = TestAccounts.newUsername();
		members.signup(name, TestAccounts.PASSWORD, TestAccounts.PASSWORD, TestAccounts.CODE);
		return name;
	}

	@Test
	void signedUpMemberCanLogInAndTheSessionHoldsTheStoredUsername() {
		String name = newMember();
		MockHttpSession session = new MockHttpSession();
		var res = controller.login(new LoginRequest(name.toUpperCase(), TestAccounts.PASSWORD), requestWith(session));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody()).containsEntry("username", name);
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isEqualTo(name);
	}

	@Test
	void defaultAdminCanLogIn() {
		MockHttpSession session = new MockHttpSession();
		var res = controller.login(new LoginRequest("admin", "admin"), requestWith(session));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isEqualTo("admin");
	}

	@Test
	void wrongPasswordOrUnknownUserIsUnauthorizedWithTheSameMessage() {
		String name = newMember();
		for (LoginRequest bad : new LoginRequest[] {new LoginRequest(name, "wrong-password"),
				new LoginRequest("nobody" + name, TestAccounts.PASSWORD), new LoginRequest(null, null)}) {
			MockHttpSession session = new MockHttpSession();
			var res = controller.login(bad, requestWith(session));
			assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
			assertThat(res.getBody()).containsEntry("error", "아이디 또는 비밀번호가 올바르지 않습니다");
			assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isNull();
		}
	}

	/** 로그인 전에 알려진 세션 ID 로 로그인 상태를 가로채지 못하도록(세션 고정), 로그인에 성공하면 세션 ID 가 바뀐다. */
	@Test
	void successfulLoginIssuesANewSessionId() {
		String name = newMember();
		MockHttpSession session = new MockHttpSession();
		String before = session.getId();
		controller.login(new LoginRequest(name, TestAccounts.PASSWORD), requestWith(session));
		assertThat(session.getId()).isNotEqualTo(before);
		assertThat(session.getAttribute(LoginInterceptor.SESSION_USER)).isEqualTo(name);
	}

	@Test
	void failedLoginKeepsTheSessionId() {
		String name = newMember();
		MockHttpSession session = new MockHttpSession();
		String before = session.getId();
		controller.login(new LoginRequest(name, "wrong-password"), requestWith(session));
		assertThat(session.getId()).isEqualTo(before);
	}
}
