package com.example.demo;

import java.util.UUID;

/** 테스트에서 쓰는 가입 정보. 인메모리 DB 를 여러 테스트가 같이 쓰므로 아이디는 매번 새로 만든다. */
final class TestAccounts {

	/** 설정이 없을 때의 기본 가입 코드(테스트 설정에도 app.signup.code 가 없다) */
	static final String CODE = "signup";
	static final String PASSWORD = "pass1234";

	private TestAccounts() {
	}

	/** 4~20자, 소문자·숫자 아이디 */
	static String newUsername() {
		return "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
	}
}
