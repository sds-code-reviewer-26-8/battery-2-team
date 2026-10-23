package com.example.demo.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.servlet.HandlerInterceptor;

/** 로그인하지 않으면 로그인 화면만 볼 수 있다. API 는 401 을 돌려준다. */
public class LoginInterceptor implements HandlerInterceptor {

	public static final String SESSION_USER = "loginUser";
	/** 로그인할 때 함께 담는 권한(Role 이름). 권한이 바뀌면 다시 로그인해야 반영된다. */
	public static final String SESSION_ROLE = "loginRole";

	/**
	 * 로그인한 상태인지. 아이디와 권한이 모두 세션에 있어야 한다. 권한이 없는 세션(권한을 담기 전 코드로 로그인한 것)은
	 * 로그인하지 않은 것으로 보고 다시 로그인하게 한다.
	 */
	public static boolean isLoggedIn(HttpSession session) {
		return session != null && session.getAttribute(SESSION_USER) != null && session.getAttribute(SESSION_ROLE) != null;
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
			throws Exception {
		HttpSession session = request.getSession(false);
		if (isLoggedIn(session)) {
			return true;
		}
		if (request.getRequestURI().startsWith("/api/")) {
			response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
		} else {
			response.sendRedirect("/login");
		}
		return false;
	}
}
