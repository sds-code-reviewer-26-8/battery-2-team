package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.SessionAttribute;

/**
 * 로그인·로그아웃과 현재 로그인한 사용자.
 * 데모용 단일 계정이다. 설정(app.login.username / app.login.password)이 없으면 admin/admin 으로 열리므로,
 * 운영 환경에서는 반드시 설정해야 하고 기본값을 쓰면 기동 로그에 경고를 남긴다.
 */
@RestController
@RequestMapping("/api")
public class AuthApiController {

	public record LoginRequest(String username, String password) {
	}

	private static final Logger log = LoggerFactory.getLogger(AuthApiController.class);

	private final String accountUsername;
	private final String accountPassword;

	/** 로그인 계정은 단일 계정이며, 설정(app.login.username / app.login.password)이 없으면 admin/admin 이다. */
	public AuthApiController(@Value("${app.login.username:admin}") String accountUsername,
			@Value("${app.login.password:admin}") String accountPassword) {
		this.accountUsername = accountUsername;
		this.accountPassword = accountPassword;
		if ("admin".equals(accountUsername) && "admin".equals(accountPassword)) {
			log.warn("로그인 계정이 기본값(admin/admin)입니다. 운영 환경에서는 app.login.username / app.login.password 를 설정하세요.");
		}
	}

	@PostMapping("/login")
	public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest request, HttpServletRequest http) {
		if (accountUsername.equals(request.username()) && accountPassword.equals(request.password())) {
			HttpSession session = http.getSession();
			// 로그인 전에 알려진 세션 ID 로 로그인 상태를 가로채지 못하도록(세션 고정), 로그인할 때 세션 ID 를 새로 발급한다
			http.changeSessionId();
			session.setAttribute(LoginInterceptor.SESSION_USER, request.username());
			return ResponseEntity.ok(Map.of("username", request.username()));
		}
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
				.body(Map.of("error", "아이디 또는 비밀번호가 올바르지 않습니다"));
	}

	@PostMapping("/logout")
	public ResponseEntity<Void> logout(HttpSession session) {
		session.invalidate();
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/me")
	public Map<String, String> me(@SessionAttribute(LoginInterceptor.SESSION_USER) String user) {
		return Map.of("username", user);
	}
}
