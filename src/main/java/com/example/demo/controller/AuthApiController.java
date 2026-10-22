package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.entity.Member;
import com.example.demo.service.MemberService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.SessionAttribute;

/** 회원가입, 로그인·로그아웃, 현재 로그인한 사용자. 가입과 로그인만 로그인 없이 쓸 수 있다. */
@RestController
@RequestMapping("/api")
public class AuthApiController {

	public record LoginRequest(String username, String password) {
	}

	public record SignupRequest(String username, String password, String passwordConfirm, String code) {
	}

	private final MemberService members;

	public AuthApiController(MemberService members) {
		this.members = members;
	}

	/** 가입만 한다. 자동으로 로그인하지는 않으므로 가입한 사람은 로그인 화면에서 로그인한다. */
	@PostMapping("/signup")
	public Map<String, String> signup(@RequestBody SignupRequest request) {
		String username = members.signup(request.username(), request.password(), request.passwordConfirm(),
				request.code()).getUsername();
		return Map.of("username", username, "message", "가입했습니다. 로그인해 주세요");
	}

	@PostMapping("/login")
	public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest request, HttpServletRequest http) {
		Optional<Member> member = members.authenticate(request.username(), request.password());
		if (member.isPresent()) {
			HttpSession session = http.getSession();
			// 로그인 전에 알려진 세션 ID 로 로그인 상태를 가로채지 못하도록(세션 고정), 로그인할 때 세션 ID 를 새로 발급한다
			http.changeSessionId();
			session.setAttribute(LoginInterceptor.SESSION_USER, member.get().getUsername());
			session.setAttribute(LoginInterceptor.SESSION_ROLE, member.get().getRole().name());
			return ResponseEntity.ok(Map.of("username", member.get().getUsername()));
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
	public Map<String, String> me(@SessionAttribute(LoginInterceptor.SESSION_USER) String user,
			@SessionAttribute(LoginInterceptor.SESSION_ROLE) String role) {
		// 화면을 열 때마다 불리므로 DB 를 보지 않고 로그인할 때 세션에 담아 둔 값을 돌려준다.
		// 권한은 아직 어떤 기능도 제한하지 않는다. 화면이 나중에 쓸 수 있도록 알려 주기만 한다.
		return Map.of("username", user, "role", role);
	}
}
