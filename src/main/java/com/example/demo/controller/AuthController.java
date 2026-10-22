package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/** 로그인·로그아웃 화면 */
@Controller
public class AuthController {

	private final String accountUsername;
	private final String accountPassword;

	/** 로그인 계정은 단일 계정이며, 설정(app.login.username / app.login.password)이 없으면 admin/admin 이다. */
	public AuthController(@Value("${app.login.username:admin}") String accountUsername,
			@Value("${app.login.password:admin}") String accountPassword) {
		this.accountUsername = accountUsername;
		this.accountPassword = accountPassword;
	}

	@GetMapping("/login")
	public String loginForm(HttpSession session) {
		if (session.getAttribute(LoginInterceptor.SESSION_USER) != null) {
			return "redirect:/orders";
		}
		return "login";
	}

	@PostMapping("/login")
	public String login(@RequestParam String username, @RequestParam String password, HttpSession session,
			Model model) {
		if (accountUsername.equals(username) && accountPassword.equals(password)) {
			session.setAttribute(LoginInterceptor.SESSION_USER, username);
			return "redirect:/orders";
		}
		model.addAttribute("error", "아이디 또는 비밀번호가 올바르지 않습니다");
		return "login";
	}

	@PostMapping("/logout")
	public String logout(HttpSession session) {
		session.invalidate();
		return "redirect:/login";
	}
}
