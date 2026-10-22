package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.demo.entity.OrderStatus;
import com.example.demo.service.BusinessException;
import com.example.demo.service.OrderService;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;


@SpringBootTest
@AutoConfigureMockMvc
class OrderFlowTests {

	private static final String ORDERS = """
			{"CHINA":3000,"JAPAN":3000,"VIETNAM":3000,"INDONESIA":3000}""";

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

	@Test
	void anonymousUserIsSentToLogin() throws Exception {
		mvc.perform(get("/orders")).andExpect(redirectedUrl("/login"));
		mvc.perform(post("/api/simulate").contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isUnauthorized());
		mvc.perform(get("/login")).andExpect(status().isOk());
	}

	@Test
	void wrongPasswordIsRejected() throws Exception {
		mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"username\":\"admin\",\"password\":\"x\"}"))
				.andExpect(status().isUnauthorized());
		mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"username\":\"other\",\"password\":\"admin\"}"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void pagesRender() throws Exception {
		MockHttpSession s = login();
		for (String url : new String[] {"/orders", "/orders/new", "/master"}) {
			mvc.perform(get(url).session(s)).andExpect(status().isOk());
		}
	}

	@Test
	void simulateReturnsThreeOptions() throws Exception {
		mvc.perform(post("/api/simulate").session(login()).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":" + ORDERS + "}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.options.length()").value(3))
				.andExpect(jsonPath("$.options[0].type").value("COST"))
				.andExpect(jsonPath("$.options[0].stock.CHINA").isArray())
				.andExpect(jsonPath("$.visits.JAPAN").value(2))
				.andExpect(jsonPath("$.master.factories.length()").value(4));
	}

	@Test
	void emptyOrderIsRejectedWithReason() throws Exception {
		mvc.perform(post("/api/simulate").session(login()).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":{\"CHINA\":0}}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").exists());
	}

	private long confirm(MockHttpSession s) throws Exception {
		MvcResult sim = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn();
		int version = JsonPath.read(sim.getResponse().getContentAsString(), "$.master.version");
		MvcResult res = mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":" + ORDERS + ",\"routeType\":\"FAST\",\"masterVersion\":" + version
								+ ",\"memo\":\"테스트\",\"customerName\":\"테스트고객\"}"))
				.andExpect(status().isOk()).andReturn();
		Integer id = JsonPath.read(res.getResponse().getContentAsString(), "$.id");
		return id;
	}

	@Test
	void confirmThenDetailAndStatusFlow() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s);

		mvc.perform(get("/orders/" + id).session(s)).andExpect(status().isOk());
		var order = orderService.getOrder(id);
		assertThat(order.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
		assertThat(order.getPlanJson()).contains("\"master\"").contains("\"plan\"");

		// 확정 → 완료는 불가
		assertThatThrownBy(() -> orderService.changeStatus(id, OrderStatus.COMPLETED, order.getVersion(), "admin"))
				.isInstanceOf(BusinessException.class);

		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, order.getVersion(), "admin");
		var inProgress = orderService.getOrder(id);
		assertThat(inProgress.getStatus()).isEqualTo(OrderStatus.IN_PROGRESS);

		// 오래된 version 으로 바꾸려 하면 충돌
		assertThatThrownBy(() -> orderService.changeStatus(id, OrderStatus.COMPLETED, order.getVersion(), "admin"))
				.isInstanceOf(BusinessException.class).hasMessageContaining("먼저");

		orderService.changeStatus(id, OrderStatus.COMPLETED, inProgress.getVersion(), "admin");
		assertThat(orderService.history(id)).hasSize(3);

		// 완료는 최종 상태
		var done = orderService.getOrder(id);
		assertThatThrownBy(() -> orderService.changeStatus(id, OrderStatus.CANCELED, done.getVersion(), "admin"))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	void confirmWithoutCustomerIsRejectedAndNothingIsSaved() throws Exception {
		MockHttpSession s = login();
		int count = orderService.listOrders(null).size();
		int version = currentMasterVersion(s);
		for (String field : new String[] {"", ",\"customerName\":null", ",\"customerName\":\"  \""}) {
			mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
							.content("{\"orders\":" + ORDERS + ",\"routeType\":\"FAST\",\"masterVersion\":" + version + field + "}"))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.error").exists());
		}
		assertThat(orderService.listOrders(null)).hasSize(count);
	}

	private int currentMasterVersion(MockHttpSession s) throws Exception {
		MvcResult sim = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn();
		return com.jayway.jsonpath.JsonPath.read(sim.getResponse().getContentAsString(), "$.master.version");
	}

	@Test
	void confirmFailsWhenMasterChangedAfterSimulation() throws Exception {
		MockHttpSession s = login();
		mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":" + ORDERS + ",\"routeType\":\"COST\",\"masterVersion\":-1,\"customerName\":\"테스트고객\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.conflict").value(true));
	}

	@Test
	@DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
	void masterUpdateBumpsVersionAndKeepsConfirmedPlans() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s);
		String before = orderService.getOrder(id).getPlanJson();

		Map<String, String> form = new HashMap<>();
		form.put("shipCount", "3");
		form.put("shipDailyCost", "1.5");
		for (String c : new String[] {"CHINA", "JAPAN", "VIETNAM", "INDONESIA"}) {
			form.put("maxDaily_" + c, "500");
			form.put("stockLimit_" + c, "5000");
			form.put("unitCost_" + c, "600");
		}
		String[] all = {"KOREA", "CHINA", "JAPAN", "VIETNAM", "INDONESIA"};
		for (int i = 0; i < all.length; i++) {
			for (int j = i + 1; j < all.length; j++) {
				form.put("days_" + all[i] + "_" + all[j], "3");
			}
		}
		mvc.perform(post("/api/master").session(s).contentType(MediaType.APPLICATION_JSON)
						.content(new ObjectMapper().writeValueAsString(form)))
				.andExpect(status().isOk());

		assertThat(orderService.getOrder(id).getPlanJson()).isEqualTo(before);
		mvc.perform(get("/api/master").session(s))
				.andExpect(jsonPath("$.shipDailyCostWon").value(150_000_000));
	}

	@Test
	void invalidMasterIsNotSaved() throws Exception {
		MockHttpSession s = login();
		mvc.perform(post("/api/master").session(s).contentType(MediaType.APPLICATION_JSON)
						.content("{\"shipCount\":\"9\",\"shipDailyCost\":\"abc\"}"))
				.andExpect(status().isBadRequest());
		mvc.perform(get("/api/master").session(s)).andExpect(jsonPath("$.shipCount").value(3));
	}
	// ---------------------------------------------------------------- 필요 납기 (TASK-004)

	/** 시뮬레이션 결과에서 마스터 version 과 경로안별 소요일을 읽는다 */
	private record Sim(int version, int costDays, int fastDays) {
	}

	private Sim simulate(MockHttpSession s) throws Exception {
		String body = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn().getResponse().getContentAsString();
		int version = JsonPath.read(body, "$.master.version");
		return new Sim(version, days(body, "COST"), days(body, "FAST"));
	}

	private static int days(String body, String type) {
		List<Integer> found = JsonPath.read(body,
				"$.options[?(@.type=='" + type + "')].totalDays");
		return found.get(0);
	}

	/** 납기 필드를 덧붙인 확정 요청. extra 는 ',"dueAsap":false,"dueDate":"..."' 처럼 JSON 조각이다 */
	private ResultActions confirmWith(MockHttpSession s, int version,
			String routeType, String extra) throws Exception {
		return mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + ",\"routeType\":\"" + routeType + "\",\"masterVersion\":"
						+ version + ",\"customerName\":\"테스트고객\"" + extra + "}"));
	}

	private static String due(LocalDate date) {
		return ",\"dueAsap\":false,\"dueDate\":\"" + date + "\"";
	}

	private long idOf(ResultActions r) throws Exception {
		Integer id = JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.id");
		return id;
	}

	@Test
	void dueDateBoundariesFiveAndFiftyDaysAreAccepted() throws Exception {
		MockHttpSession s = login();
		Sim sim = simulate(s);
		for (int days : new int[] {5, 50}) {
			LocalDate date = LocalDate.now().plusDays(days);
			long id = idOf(confirmWith(s, sim.version(), "FAST", due(date))
					.andExpect(status().isOk()).andExpect(jsonPath("$.id").isNumber()));
			var order = orderService.getOrder(id);
			assertThat(order.getDueAsap()).isFalse();
			assertThat(order.getDueDate()).isEqualTo(date);
			assertThat(order.getDueExceeded()).isEqualTo(sim.fastDays() > days);
		}
	}

	@Test
	void dueDateOutOfRangeOrMalformedIsRejectedWithReasonAndNotSaved() throws Exception {
		MockHttpSession s = login();
		Sim sim = simulate(s);
		int before = orderService.listOrders(null).size();
		String range = "필요 납기일은 오늘부터 5~50일 사이로 선택하세요";
		Map<String, String> cases = new LinkedHashMap<>();
		cases.put(due(LocalDate.now().plusDays(4)), range);
		cases.put(due(LocalDate.now().plusDays(51)), range);
		cases.put(due(LocalDate.now().minusDays(1)), range);
		cases.put(",\"dueAsap\":false,\"dueDate\":\"2026/13/40\"", "필요 납기일 형식이 올바르지 않습니다(yyyy-MM-dd)");
		cases.put(",\"dueAsap\":false,\"dueDate\":\"abc\"", "필요 납기일 형식이 올바르지 않습니다(yyyy-MM-dd)");
		cases.put(",\"dueAsap\":false", "필요 납기일을 선택하거나 '가능한 빨리'를 체크하세요");
		cases.put(",\"dueAsap\":false,\"dueDate\":\"\"", "필요 납기일을 선택하거나 '가능한 빨리'를 체크하세요");
		for (var c : cases.entrySet()) {
			confirmWith(s, sim.version(), "COST", c.getKey())
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.error").value(c.getValue()))
					.andExpect(jsonPath("$.conflict").value(false))
					.andExpect(jsonPath("$.errors[0]").value(c.getValue()));
		}
		assertThat(orderService.listOrders(null)).hasSize(before);
	}

	@Test
	void asapConfirmsWithoutDueDateAndDetailShowsIt() throws Exception {
		MockHttpSession s = login();
		Sim sim = simulate(s);
		// '가능한 빨리'이면 날짜가 범위 밖이어도 보지 않는다
		long id = idOf(confirmWith(s, sim.version(), "COST", ",\"dueAsap\":true,\"dueDate\":\"1999-01-01\"")
				.andExpect(status().isOk()));
		mvc.perform(get("/api/orders/" + id).session(s))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dueAsap").value(true))
				.andExpect(jsonPath("$.dueDate").doesNotExist())
				.andExpect(jsonPath("$.dueExceeded").doesNotExist());
	}

	@Test
	void requestWithoutDueFieldsStillConfirmsAndDetailHasNullDue() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s); // 납기 필드 없는 기존 형식 요청
		var order = orderService.getOrder(id);
		assertThat(order.getDueAsap()).isNull();
		assertThat(order.getDueDate()).isNull();
		assertThat(order.getDueExceeded()).isNull();
		mvc.perform(get("/api/orders/" + id).session(s))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(id))
				.andExpect(jsonPath("$.routeLabel").value("가장 빠르게"))
				.andExpect(jsonPath("$.memo").value("테스트"))
				.andExpect(jsonPath("$.status.name").value("CONFIRMED"))
				.andExpect(jsonPath("$.plan.plan.type").value("FAST"))
				.andExpect(jsonPath("$.dueAsap").doesNotExist())
				.andExpect(jsonPath("$.dueDate").doesNotExist())
				.andExpect(jsonPath("$.dueExceeded").doesNotExist());
	}

	@Test
	void exceededRouteIsStillConfirmedAndExceededFlagIsComputedByServer() throws Exception {
		MockHttpSession s = login();
		Sim sim = simulate(s);
		assertThat(sim.costDays()).isGreaterThan(sim.fastDays());
		int days = Math.max(5, Math.min(50, sim.fastDays())); // 납기 = FAST 소요일 → FAST 정상, COST 초과
		LocalDate date = LocalDate.now().plusDays(days);

		long costId = idOf(confirmWith(s, sim.version(), "COST", due(date)).andExpect(status().isOk()));
		mvc.perform(get("/api/orders/" + costId).session(s))
				.andExpect(jsonPath("$.dueAsap").value(false))
				.andExpect(jsonPath("$.dueDate").value(date.toString()))
				.andExpect(jsonPath("$.dueExceeded").value(sim.costDays() > days));

		long fastId = idOf(confirmWith(s, sim.version(), "FAST", due(date) + ",\"dueExceeded\":true")
				.andExpect(status().isOk()));
		// 화면이 보낸 초과 여부는 무시하고 서버 계산(소요일 == 납기 일수 → 정상)을 저장한다
		mvc.perform(get("/api/orders/" + fastId).session(s))
				.andExpect(jsonPath("$.dueExceeded").value(sim.fastDays() > days));
	}

	@Test
	void dueValidationKeepsExistingErrorOrder() throws Exception {
		MockHttpSession s = login();
		// 버전 불일치는 납기가 잘못돼도 여전히 409
		confirmWith(s, -1, "COST", due(LocalDate.now().plusDays(4)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.conflict").value(true));
	}
}
