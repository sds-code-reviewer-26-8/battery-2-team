package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.demo.entity.Order;
import com.example.demo.service.OrderService;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * PR #33 리뷰(sy9169park) 5·6번 반영으로 보강한 납기 테스트.
 * - 납기 규칙 API(/api/orders/due-rules): 로그인 필요, /{id} 라우트와 충돌 없음, 서버 검증과 같은 범위
 * - 납기 초과 경계: 납기 일수 == 총 소요일이면 정상, 하루 짧으면 초과
 * - 'dueAsap' 없이 날짜만 보낸 요청, 달력에 없는 날짜·형식 변형은 형식 오류 400
 */
@SpringBootTest
@AutoConfigureMockMvc
class DueDateReviewTests {

	private static final String ORDERS = """
			{"CHINA":3000,"JAPAN":3000,"VIETNAM":3000,"INDONESIA":3000}""";
	private static final String FORMAT_ERROR = "필요 납기일 형식이 올바르지 않습니다(yyyy-MM-dd)";

	@Autowired
	MockMvc mvc;
	@Autowired
	OrderService orderService;

	private MockHttpSession login() throws Exception {
		MockHttpSession session = new MockHttpSession();
		mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"username\":\"admin\",\"password\":\"admin\"}").session(session))
				.andExpect(status().isOk());
		return session;
	}

	private record Sim(int version, int fastDays) {
	}

	private Sim simulate(MockHttpSession s) throws Exception {
		String body = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn().getResponse().getContentAsString();
		int version = JsonPath.read(body, "$.master.version");
		List<Integer> fast = JsonPath.read(body, "$.options[?(@.type=='FAST')].totalDays");
		return new Sim(version, fast.get(0));
	}

	private ResultActions confirm(MockHttpSession s, int version, String routeType, String dueJson) throws Exception {
		return mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + ",\"routeType\":\"" + routeType + "\",\"masterVersion\":"
						+ version + ",\"customerName\":\"테스트고객\"" + dueJson + "}"));
	}

	private static String due(LocalDate date) {
		return ",\"dueAsap\":false,\"dueDate\":\"" + date + "\"";
	}

	private long idOf(ResultActions r) throws Exception {
		Integer id = JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.id");
		return id;
	}

	@Test
	void dueRulesRequireLogin() throws Exception {
		mvc.perform(get("/api/orders/due-rules")).andExpect(status().isUnauthorized());
	}

	@Test
	void dueRulesReturnRangeAndServerTodayWithoutClashingWithIdRoute() throws Exception {
		mvc.perform(get("/api/orders/due-rules").session(login()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.minDays").value(OrderService.MIN_DUE_DAYS))
				.andExpect(jsonPath("$.maxDays").value(OrderService.MAX_DUE_DAYS))
				.andExpect(jsonPath("$.today").value(LocalDate.now().toString()));
	}

	@Test
	void dueRulesRangeMatchesServerValidation() throws Exception {
		MockHttpSession s = login();
		String body = mvc.perform(get("/api/orders/due-rules").session(s)).andReturn().getResponse().getContentAsString();
		int min = JsonPath.read(body, "$.minDays");
		int max = JsonPath.read(body, "$.maxDays");
		LocalDate today = LocalDate.parse(JsonPath.read(body, "$.today"));
		Sim sim = simulate(s);

		confirm(s, sim.version(), "FAST", due(today.plusDays(min))).andExpect(status().isOk());
		confirm(s, sim.version(), "FAST", due(today.plusDays(max))).andExpect(status().isOk());
		confirm(s, sim.version(), "FAST", due(today.plusDays(min - 1))).andExpect(status().isBadRequest());
		confirm(s, sim.version(), "FAST", due(today.plusDays(max + 1))).andExpect(status().isBadRequest());
	}

	@Test
	void dueEqualToTotalDaysIsNotExceededButOneDayShorterIs() throws Exception {
		MockHttpSession s = login();
		Sim sim = simulate(s);
		LocalDate today = LocalDate.now();

		Order onTime = orderService.getOrder(
				idOf(confirm(s, sim.version(), "FAST", due(today.plusDays(sim.fastDays()))).andExpect(status().isOk())));
		assertThat(onTime.getDueExceeded()).isFalse();

		Order late = orderService.getOrder(
				idOf(confirm(s, sim.version(), "FAST", due(today.plusDays(sim.fastDays() - 1))).andExpect(status().isOk())));
		assertThat(late.getDueExceeded()).isTrue();
	}

	@Test
	void dateWithoutAsapFieldIsTreatedAsChosenDueDate() throws Exception {
		MockHttpSession s = login();
		Sim sim = simulate(s);
		LocalDate date = LocalDate.now().plusDays(30);
		Order order = orderService.getOrder(
				idOf(confirm(s, sim.version(), "FAST", ",\"dueDate\":\"" + date + "\"").andExpect(status().isOk())));
		assertThat(order.getDueAsap()).isFalse();
		assertThat(order.getDueDate()).isEqualTo(date);
	}

	@Test
	void impossibleOrMalformedDatesAreFormatErrors() throws Exception {
		MockHttpSession s = login();
		Sim sim = simulate(s);
		int before = orderService.listOrders(null).size();
		for (String bad : new String[] {"2026-02-30", "2026-1-5", "20261027", "2026-10-27T00:00"}) {
			confirm(s, sim.version(), "COST", ",\"dueAsap\":false,\"dueDate\":\"" + bad + "\"")
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.error").value(FORMAT_ERROR));
		}
		assertThat(orderService.listOrders(null)).hasSize(before);
	}
}
