package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 화면 주소(/orders 등)를 정적 HTML 파일로 연결한다. 화면은 HTML 과 JavaScript 로 만들어져 있고,
 * 데이터는 JSON API(/api/...)에서 가져온다. 서버는 화면에 데이터를 채워 주지 않는다.
 */
@Controller
public class PageController {

	@GetMapping("/")
	public String home() {
		return "redirect:/orders";
	}

	/** 이미 로그인했으면 로그인 화면 대신 주문 목록으로 보낸다. */
	@GetMapping("/login")
	public String login(HttpSession session) {
		if (session.getAttribute(LoginInterceptor.SESSION_USER) != null) {
			return "redirect:/orders";
		}
		return "forward:/login.html";
	}

	@GetMapping("/orders")
	public String orders() {
		return "forward:/orders.html";
	}

	@GetMapping("/orders/new")
	public String newOrder() {
		return "forward:/order-new.html";
	}

	@GetMapping("/orders/{id}")
	public String orderDetail() {
		return "forward:/order-detail.html";
	}

	@GetMapping("/master")
	public String master() {
		return "forward:/master.html";
	}
}
