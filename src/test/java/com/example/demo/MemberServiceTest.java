package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.demo.entity.Member;
import com.example.demo.repository.MemberRepository;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MemberService;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 회원가입과 로그인 확인을 실제 DB(인메모리 H2)로 확인한다. 목(mock)은 쓰지 않는다. */
@SpringBootTest
@AutoConfigureMockMvc
class MemberServiceTest {

	@Autowired
	MemberService service;
	@Autowired
	MemberRepository repository;
	@Autowired
	PasswordEncoder encoder;

	private static final String CODE = TestAccounts.CODE;
	private static final String PW = TestAccounts.PASSWORD;

	private Member signup(String username) {
		return service.signup(username, PW, PW, CODE);
	}

	private void assertReasons(String username, String password, String confirm, String code, String... reasons) {
		assertThatThrownBy(() -> service.signup(username, password, confirm, code))
				.isInstanceOfSatisfying(BusinessException.class, e -> {
					assertThat(e.isConflict()).isFalse();
					assertThat(e.getMessages()).containsExactly(reasons);
				});
	}

	// ---------------------------------------------------------------- 가입

	@Test
	void signupStoresAHashNotThePassword() {
		String name = TestAccounts.newUsername();
		Member m = signup(name);
		assertThat(m.getId()).isNotNull();
		assertThat(m.getUsername()).isEqualTo(name);
		assertThat(m.getCreatedAt()).isBeforeOrEqualTo(LocalDateTime.now());
		Member stored = repository.findByUsername(name).orElseThrow();
		assertThat(stored.getPasswordHash()).isNotEqualTo(PW).doesNotContain(PW).startsWith("$2");
		assertThat(encoder.matches(PW, stored.getPasswordHash())).isTrue();
		assertThat(encoder.matches("other-password", stored.getPasswordHash())).isFalse();
	}

	@Test
	void samePasswordGetsADifferentHashEveryTime() {
		Member a = signup(TestAccounts.newUsername());
		Member b = signup(TestAccounts.newUsername());
		assertThat(a.getPasswordHash()).isNotEqualTo(b.getPasswordHash());
	}

	@Test
	void usernameIsTrimmedAndLowercased() {
		String name = TestAccounts.newUsername();
		Member m = service.signup("  " + name.toUpperCase() + " ", PW, PW, CODE);
		assertThat(m.getUsername()).isEqualTo(name);
	}

	@Test
	void duplicateUsernameIsAConflictEvenWhenOnlyTheCaseDiffers() {
		String name = TestAccounts.newUsername();
		signup(name);
		for (String again : new String[] {name, name.toUpperCase()}) {
			assertThatThrownBy(() -> signup(again)).isInstanceOfSatisfying(BusinessException.class, e -> {
				assertThat(e.isConflict()).isTrue();
				assertThat(e.getMessage()).isEqualTo("이미 사용 중인 아이디입니다");
			});
		}
		assertThat(repository.findAll().stream().filter(m -> m.getUsername().equals(name))).hasSize(1);
	}

	@Test
	void databaseKeepsUsernamesUnique() {
		String name = TestAccounts.newUsername();
		repository.saveAndFlush(new Member(name, "hash", LocalDateTime.now()));
		assertThatThrownBy(() -> repository.saveAndFlush(new Member(name, "hash", LocalDateTime.now())))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void adminAccountCannotBeTakenOver() {
		assertThatThrownBy(() -> signup("admin")).isInstanceOfSatisfying(BusinessException.class,
				e -> assertThat(e.isConflict()).isTrue());
	}

	// ---------------------------------------------------------------- 입력 검증

	@Test
	void emptyInputReportsEveryProblemAtOnce() {
		assertReasons("", "", "", "", "아이디는 4자 이상 20자 이하여야 합니다", "비밀번호는 8자 이상이어야 합니다", "가입 코드가 올바르지 않습니다");
	}

	@Test
	void nullInputIsReportedNotCrashed() {
		assertThatThrownBy(() -> service.signup(null, null, null, null)).isInstanceOfSatisfying(BusinessException.class,
				e -> assertThat(e.getMessages()).hasSize(3));
	}

	@Test
	void usernameLengthAndCharactersAreChecked() {
		assertReasons("abc", PW, PW, CODE, "아이디는 4자 이상 20자 이하여야 합니다");
		assertReasons("a".repeat(21), PW, PW, CODE, "아이디는 4자 이상 20자 이하여야 합니다");
		assertReasons("한글아이디", PW, PW, CODE, "아이디는 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다");
		assertReasons("ab cd", PW, PW, CODE, "아이디는 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다");
		assertReasons("ab-cd", PW, PW, CODE, "아이디는 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다");
	}

	@Test
	void usernameLengthBoundariesAreAccepted() {
		String unique = TestAccounts.newUsername();
		assertThat(signup("a_" + unique.substring(1, 3) + "x").getUsername()).hasSize(5);
		assertThat(signup((unique + "00000000000").substring(0, 20)).getUsername()).hasSize(20);
		assertThat(signup("z" + unique.substring(1, 4)).getUsername()).hasSize(4);
	}

	@Test
	void passwordRulesAreChecked() {
		String name = TestAccounts.newUsername();
		assertReasons(name, "short12", "short12", CODE, "비밀번호는 8자 이상이어야 합니다");
		assertReasons(name, "p".repeat(51), "p".repeat(51), CODE, "비밀번호는 50자 이하여야 합니다");
		assertReasons(name, PW, "different1", CODE, "비밀번호 확인이 일치하지 않습니다");
		assertReasons(name, PW, null, CODE, "비밀번호 확인이 일치하지 않습니다");
		assertThat(service.signup(TestAccounts.newUsername(), "p".repeat(8), "p".repeat(8), CODE)).isNotNull();
		assertThat(service.signup(TestAccounts.newUsername(), "p".repeat(50), "p".repeat(50), CODE)).isNotNull();
	}

	@Test
	void passwordMustDifferFromTheUsername() {
		assertReasons("sameasname1", "sameasname1", "sameasname1", CODE, "비밀번호는 아이디와 같을 수 없습니다");
	}

	@Test
	void wrongSignupCodeIsRejectedAndNothingIsSaved() {
		String name = TestAccounts.newUsername();
		assertReasons(name, PW, PW, "wrong-code", "가입 코드가 올바르지 않습니다");
		assertReasons(name, PW, PW, null, "가입 코드가 올바르지 않습니다");
		assertReasons(name, PW, PW, CODE.toUpperCase(), "가입 코드가 올바르지 않습니다");
		assertThat(repository.existsByUsername(name)).isFalse();
	}

	@Test
	void validationErrorsAreReportedBeforeDuplicates() {
		String name = TestAccounts.newUsername();
		signup(name);
		// 이미 있는 아이디라도 다른 입력 오류가 있으면 입력 오류(400)가 먼저 보고된다
		assertReasons(name, "short", "short", CODE, "비밀번호는 8자 이상이어야 합니다");
	}

	// ---------------------------------------------------------------- 로그인 확인

	@Test
	void authenticateReturnsTheStoredUsernameOnlyForTheRightPassword() {
		String name = TestAccounts.newUsername();
		signup(name);
		assertThat(service.authenticate(name, PW)).contains(name);
		assertThat(service.authenticate("  " + name.toUpperCase() + " ", PW)).contains(name);
		assertThat(service.authenticate(name, "wrong-password")).isEmpty();
		assertThat(service.authenticate(name, "")).isEmpty();
		assertThat(service.authenticate(name, null)).isEmpty();
		assertThat(service.authenticate("nobody" + name, PW)).isEmpty();
		assertThat(service.authenticate(null, null)).isEmpty();
	}

	@Test
	void defaultAdminIsCreatedAtStartupAndKeptAcrossRestarts() {
		assertThat(service.authenticate("admin", "admin")).contains("admin");
		String before = repository.findByUsername("admin").orElseThrow().getPasswordHash();
		service.initDefaultAdmin();
		service.initDefaultAdmin();
		assertThat(repository.findByUsername("admin").orElseThrow().getPasswordHash()).isEqualTo(before);
		assertThat(repository.findAll().stream().filter(m -> m.getUsername().equals("admin"))).hasSize(1);
		assertThat(encoder.matches("admin", before)).isTrue();
	}
}
