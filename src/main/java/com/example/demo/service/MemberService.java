package com.example.demo.service;

import com.example.demo.entity.Member;
import com.example.demo.entity.Role;
import com.example.demo.repository.MemberRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회원가입과 로그인 확인.
 *
 * <p>가입은 가입 코드(설정 app.signup.code)를 아는 사람만 할 수 있다. 이 앱은 로그인한 사람만 쓰는 내부 도구라서,
 * 누구나 가입할 수 있게 열어 두면 접근 통제가 사라지기 때문이다. 설정이 없으면 기본 코드({@value #DEFAULT_SIGNUP_CODE})로
 * 열리므로 운영 환경에서는 반드시 설정해야 하고, 기본값을 쓰면 기동 로그에 경고를 남긴다.
 */
@Service
public class MemberService {

	public static final String DEFAULT_SIGNUP_CODE = "signup";
	/** 권한을 아직 나누지 않았으므로 가입한 회원도 처음 만든 admin 과 같은 권한을 갖는다. */
	public static final Role DEFAULT_ROLE = Role.ADMIN;
	private static final Logger log = LoggerFactory.getLogger(MemberService.class);

	static final int MIN_USERNAME = 4;
	static final int MAX_USERNAME = 20;
	static final int MIN_PASSWORD = 8;
	/**
	 * BCrypt 는 비밀번호가 72바이트를 넘으면 예외를 던진다. 글자 수가 아니라 바이트 수로 제한해야 한다
	 * (한글은 한 글자가 3바이트라 24자면 72바이트다).
	 */
	static final int MAX_PASSWORD_BYTES = 72;
	private static final Pattern USERNAME = Pattern.compile("[a-z0-9_]+");

	private final MemberRepository members;
	private final PasswordEncoder encoder;
	private final String signupCode;
	private final String initialUsername;
	private final String initialPassword;
	/** 없는 아이디로 로그인해도 해시 비교 시간이 비슷하도록 쓰는 가짜 해시 */
	private final String dummyHash;

	public MemberService(MemberRepository members, PasswordEncoder encoder,
			@Value("${app.signup.code:" + DEFAULT_SIGNUP_CODE + "}") String signupCode,
			@Value("${app.login.username:admin}") String initialUsername,
			@Value("${app.login.password:admin}") String initialPassword) {
		this.members = members;
		this.encoder = encoder;
		this.signupCode = signupCode;
		this.initialUsername = initialUsername;
		this.initialPassword = initialPassword;
		this.dummyHash = encoder.encode("dummy-password-for-timing");
		if (DEFAULT_SIGNUP_CODE.equals(signupCode)) {
			log.warn("가입 코드가 기본값입니다. 운영 환경에서는 app.signup.code 를 설정하세요.");
		}
	}

	/**
	 * 처음 쓸 계정을 만든다. 설정(app.login.username / app.login.password, 없으면 admin/admin)의 아이디가
	 * 아직 없을 때만 만들며, 이미 있으면 비밀번호를 바꾸지 않는다. 기존 주문의 작성자(admin)가 계속 유효하도록 한다.
	 */
	@Transactional
	public void initDefaultAdmin() {
		String username = normalize(initialUsername);
		if (members.existsByUsername(username)) {
			return;
		}
		members.save(new Member(username, encoder.encode(initialPassword), Role.ADMIN, LocalDateTime.now()));
		if ("admin".equals(username) && "admin".equals(initialPassword)) {
			log.warn("로그인 계정이 기본값(admin/admin)입니다. 운영 환경에서는 app.login.username / app.login.password 를 설정하세요.");
		}
	}

	/**
	 * 회원가입. 입력 오류는 모아서 한 번에 알리고(400), 이미 있는 아이디는 충돌(409)로 알린다.
	 * 아이디는 앞뒤 공백을 지우고 소문자로 바꿔 저장하므로 대소문자만 다른 아이디도 중복이다.
	 */
	@Transactional
	public Member signup(String username, String password, String passwordConfirm, String code) {
		String name = normalize(username);
		String pw = password == null ? "" : password;
		List<String> errors = new ArrayList<>();

		if (name.length() < MIN_USERNAME || name.length() > MAX_USERNAME) {
			errors.add("아이디는 %d자 이상 %d자 이하여야 합니다".formatted(MIN_USERNAME, MAX_USERNAME));
		}
		if (!name.isEmpty() && !USERNAME.matcher(name).matches()) {
			errors.add("아이디는 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다");
		}
		if (pw.length() < MIN_PASSWORD) {
			errors.add("비밀번호는 %d자 이상이어야 합니다".formatted(MIN_PASSWORD));
		}
		if (pw.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
			errors.add("비밀번호가 너무 깁니다. 영문·숫자는 %d자, 한글은 %d자까지 쓸 수 있습니다"
					.formatted(MAX_PASSWORD_BYTES, MAX_PASSWORD_BYTES / 3));
		}
		if (!pw.isEmpty() && pw.equals(name)) {
			errors.add("비밀번호는 아이디와 같을 수 없습니다");
		}
		if (!pw.equals(passwordConfirm == null ? "" : passwordConfirm)) {
			errors.add("비밀번호 확인이 일치하지 않습니다");
		}
		if (!codeMatches(code)) {
			errors.add("가입 코드가 올바르지 않습니다");
		}
		if (!errors.isEmpty()) {
			throw new BusinessException(errors);
		}
		if (members.existsByUsername(name)) {
			throw duplicate();
		}
		try {
			return members.saveAndFlush(new Member(name, encoder.encode(pw), DEFAULT_ROLE, LocalDateTime.now()));
		} catch (DataIntegrityViolationException e) {
			// 같은 아이디로 동시에 가입한 경우(유일 제약)
			throw duplicate();
		}
	}

	/**
	 * 아이디와 비밀번호가 맞으면 그 회원(저장된 아이디는 소문자, 권한 포함)을 돌려준다.
	 * 어느 쪽이 틀렸는지는 구분하지 않는다.
	 */
	@Transactional(readOnly = true)
	public Optional<Member> authenticate(String username, String password) {
		String pw = password == null ? "" : password;
		Optional<Member> member = members.findByUsername(normalize(username));
		boolean ok = encoder.matches(pw, member.map(Member::getPasswordHash).orElse(dummyHash));
		return ok ? member : Optional.empty();
	}

	private static String normalize(String username) {
		return username == null ? "" : username.strip().toLowerCase(Locale.ROOT);
	}

	/** 가입 코드 비교. 맞은 글자 수에 따라 시간이 달라지지 않도록 상수 시간으로 비교한다. */
	private boolean codeMatches(String code) {
		byte[] given = (code == null ? "" : code).getBytes(StandardCharsets.UTF_8);
		return MessageDigest.isEqual(given, signupCode.getBytes(StandardCharsets.UTF_8));
	}

	private static BusinessException duplicate() {
		return new BusinessException("이미 사용 중인 아이디입니다", true);
	}
}
