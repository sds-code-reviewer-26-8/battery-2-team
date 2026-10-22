package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/** 로그인할 수 있는 회원. 주문의 작성자·상태 변경자는 이 아이디 문자열을 그대로 기록한다. */
@Entity
@Table(name = "members")
public class Member {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	/** 소문자로 정규화한 아이디. 유일하다. */
	@Column(nullable = false, unique = true, length = 20)
	private String username;

	/** BCrypt 해시. 평문 비밀번호는 저장하지 않는다. */
	@Column(nullable = false, length = 100)
	private String passwordHash;

	/**
	 * 권한. 지금은 모든 회원이 ADMIN 이다(권한별 제한은 아직 없음).
	 * 기존 DB 의 회원 행에도 열이 추가될 때 ADMIN 이 채워지도록 기본값을 DB 에 둔다.
	 */
	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20, columnDefinition = "varchar(20) default 'ADMIN' not null")
	private Role role;

	@Column(nullable = false)
	private LocalDateTime createdAt;

	protected Member() {
	}

	public Member(String username, String passwordHash, Role role, LocalDateTime createdAt) {
		this.username = username;
		this.passwordHash = passwordHash;
		this.role = role;
		this.createdAt = createdAt;
	}

	public Long getId() {
		return id;
	}

	public String getUsername() {
		return username;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public Role getRole() {
		return role;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}
}
