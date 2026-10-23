package com.example.demo.entity;

/**
 * 회원의 권한. 아직 권한에 따라 기능을 제한하지 않으므로, 지금은 모든 회원이 {@link #ADMIN} 이고 이 값으로
 * 달라지는 동작은 없다. 담당자·관리자를 나누게 되면(PRD §10-6) 값을 더하고, 접근을 막는 곳은
 * {@code LoginInterceptor} 나 서비스에서 이 값을 보고 판단한다.
 */
public enum Role {
	ADMIN("관리자");

	private final String label;

	Role(String label) {
		this.label = label;
	}

	public String getLabel() {
		return label;
	}
}
