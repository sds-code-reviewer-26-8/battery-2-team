package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.service.MasterService;
import com.example.demo.service.OrderService;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * 화면 주소와 JSON API 의 응답을 확인한다. 화면은 정적 HTML 이고 데이터는 JSON API 로 가져오므로,
 * 화면에 보이는 값은 모두 여기서 확인하는 API 응답에서 나온다.
 * 실제 서버 설정(로그인 검사 포함)으로 돌리며 목(mock)은 쓰지 않는다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class WebBehaviorTest {

	private static final String ORDERS = """
			{"CHINA":3000,"JAPAN":3000,"VIETNAM":3000,"INDONESIA":3000}""";
	private static final String SIMULATE_GOLDEN = "golden/simulate-default.json";
	private static final Path SIMULATE_GOLDEN_SOURCE = Path.of("src/test/resources", SIMULATE_GOLDEN);

	@Autowired
	MockMvc mvc;
	@Autowired
	MasterService masters;
	@Autowired
	OrderService orderService;
	@Autowired
	ObjectMapper json;

	private Map<String, String> originalForm;

	@BeforeEach
	void rememberMaster() {
		originalForm = masters.masterForm();
	}

	@AfterEach
	void restoreMaster() {
		masters.updateMaster(originalForm);
	}

	private MockHttpSession login() throws Exception {
		MockHttpSession session = new MockHttpSession();
		mvc.perform(postJson("/api/login", null, "{\"username\":\"admin\",\"password\":\"admin\"}").session(session))
				.andExpect(status().isOk());
		return session;
	}

	private MockHttpServletRequestBuilder postJson(String url, MockHttpSession s, String body) {
		MockHttpServletRequestBuilder req = post(url).contentType(MediaType.APPLICATION_JSON).content(body);
		return s == null ? req : req.session(s);
	}

	private Order confirm(String memo) {
		return orderService.confirm(ServiceBehaviorTest.orders(3000, 3000, 3000, 3000), "COST",
				masters.currentMaster().version(), memo, "admin");
	}

	// ---------------------------------------------------------------- 화면 주소

	@Test
	void pageUrlsServeStaticHtmlWhenLoggedIn() throws Exception {
		MockHttpSession s = login();
		mvc.perform(get("/orders").session(s)).andExpect(forwardedUrl("/orders.html"));
		mvc.perform(get("/orders/new").session(s)).andExpect(forwardedUrl("/order-new.html"));
		mvc.perform(get("/orders/123").session(s)).andExpect(forwardedUrl("/order-detail.html"));
		mvc.perform(get("/master").session(s)).andExpect(forwardedUrl("/master.html"));
		mvc.perform(get("/").session(s)).andExpect(redirectedUrl("/orders"));
	}

	@Test
	void everyPageNeedsLoginExceptTheLoginPage() throws Exception {
		for (String url : new String[] {"/orders", "/orders/new", "/orders/1", "/master", "/orders.html", "/master.html"}) {
			mvc.perform(get(url)).andExpect(redirectedUrl("/login"));
		}
		mvc.perform(get("/login")).andExpect(status().isOk()).andExpect(forwardedUrl("/login.html"));
	}

	@Test
	void loginPageRedirectsWhenAlreadyLoggedIn() throws Exception {
		mvc.perform(get("/login").session(login())).andExpect(redirectedUrl("/orders"));
	}

	@Test
	void everyApiNeedsLoginExceptLogin() throws Exception {
		mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/master")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/master/form")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/orders")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/orders/1")).andExpect(status().isUnauthorized());
		mvc.perform(postJson("/api/simulate", null, "{}")).andExpect(status().isUnauthorized());
		mvc.perform(postJson("/api/orders", null, "{}")).andExpect(status().isUnauthorized());
		mvc.perform(postJson("/api/orders/1/status", null, "{}")).andExpect(status().isUnauthorized());
		mvc.perform(postJson("/api/master", null, "{}")).andExpect(status().isUnauthorized());
	}

	// ---------------------------------------------------------------- 로그인

	@Test
	void loginSetsSessionAndMeReturnsTheUser() throws Exception {
		MockHttpSession s = login();
		mvc.perform(get("/api/me").session(s)).andExpect(status().isOk()).andExpect(jsonPath("$.username").value("admin"));
	}

	@Test
	void wrongLoginIsUnauthorizedWithMessage() throws Exception {
		mvc.perform(postJson("/api/login", null, "{\"username\":\"admin\",\"password\":\"nope\"}"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.error").value("아이디 또는 비밀번호가 올바르지 않습니다"));
		mvc.perform(postJson("/api/login", null, "{\"username\":\"root\",\"password\":\"admin\"}"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void logoutEndsTheSession() throws Exception {
		MockHttpSession s = login();
		mvc.perform(post("/api/logout").session(s)).andExpect(status().isNoContent());
		mvc.perform(get("/api/me").session(s)).andExpect(status().isUnauthorized());
	}

	// ---------------------------------------------------------------- 주문 목록·상세

	@Test
	void listHasOrdersCountsTotalAndStatuses() throws Exception {
		Order order = confirm("목록 확인");
		MvcResult res = mvc.perform(get("/api/orders").session(login())).andExpect(status().isOk())
				.andExpect(jsonPath("$.statuses.length()").value(4))
				.andExpect(jsonPath("$.statuses[0].name").value("CONFIRMED"))
				.andExpect(jsonPath("$.statuses[0].label").value("확정"))
				.andExpect(jsonPath("$.statuses[3].name").value("CANCELED")).andReturn();
		JsonNode body = json.readTree(res.getResponse().getContentAsString(StandardCharsets.UTF_8));
		assertThat(body.get("orders")).hasSize(orderService.listOrders(null).size());
		assertThat(body.get("total").asLong()).isEqualTo(orderService.listOrders(null).size());
		Map<OrderStatus, Long> counts = orderService.countByStatus();
		for (OrderStatus st : OrderStatus.values()) {
			assertThat(body.get("counts").get(st.name()).asLong()).isEqualTo(counts.get(st));
		}
		JsonNode first = body.get("orders").get(0);
		assertThat(first.get("id").asLong()).isEqualTo(order.getId());
		assertThat(first.get("confirmedAt").asString()).matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}");
		assertThat(first.get("totalK").asInt()).isEqualTo(12000);
		assertThat(first.get("routeLabel").asString()).isEqualTo("총 비용 최소");
		assertThat(first.get("totalCostEok").asString()).isEqualTo(order.getTotalCostEok());
		assertThat(first.get("status").get("name").asString()).isEqualTo("CONFIRMED");
		assertThat(first.get("status").get("label").asString()).isEqualTo("확정");
		assertThat(first.get("createdBy").asString()).isEqualTo("admin");
	}

	@Test
	void listCanBeFilteredByStatusButCountsStayOverall() throws Exception {
		Order running = confirm(null);
		orderService.changeStatus(running.getId(), OrderStatus.IN_PROGRESS, running.getVersion(), "admin");
		confirm(null);
		MvcResult res = mvc.perform(get("/api/orders").param("status", "IN_PROGRESS").session(login()))
				.andExpect(status().isOk()).andReturn();
		JsonNode body = json.readTree(res.getResponse().getContentAsString(StandardCharsets.UTF_8));
		assertThat(body.get("orders")).isNotEmpty();
		body.get("orders").forEach(o -> assertThat(o.get("status").get("name").asString()).isEqualTo("IN_PROGRESS"));
		assertThat(body.get("total").asLong()).isEqualTo(orderService.listOrders(null).size());
		assertThat(body.get("total").asLong()).isGreaterThan(body.get("orders").size());
	}

	@Test
	void unknownStatusFilterIsABadRequest() throws Exception {
		mvc.perform(get("/api/orders").param("status", "NOPE").session(login())).andExpect(status().isBadRequest());
	}

	@Test
	void detailHasOrderHistoryNextStatusesAndStoredPlan() throws Exception {
		Order order = confirm("상세 확인용 메모");
		orderService.changeStatus(order.getId(), OrderStatus.IN_PROGRESS, order.getVersion(), "admin");
		long version = orderService.getOrder(order.getId()).getVersion();
		mvc.perform(get("/api/orders/" + order.getId()).session(login())).andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(order.getId())).andExpect(jsonPath("$.memo").value("상세 확인용 메모"))
				.andExpect(jsonPath("$.createdBy").value("admin")).andExpect(jsonPath("$.routeLabel").value("총 비용 최소"))
				.andExpect(jsonPath("$.status.name").value("IN_PROGRESS")).andExpect(jsonPath("$.status.label").value("진행"))
				.andExpect(jsonPath("$.version").value(version))
				.andExpect(jsonPath("$.nextStatuses.length()").value(2))
				.andExpect(jsonPath("$.nextStatuses[0].name").value("COMPLETED"))
				.andExpect(jsonPath("$.nextStatuses[1].name").value("CANCELED"))
				.andExpect(jsonPath("$.history.length()").value(2))
				.andExpect(jsonPath("$.history[0].from").isEmpty())
				.andExpect(jsonPath("$.history[0].to.label").value("확정"))
				.andExpect(jsonPath("$.history[1].from.label").value("확정"))
				.andExpect(jsonPath("$.history[1].to.label").value("진행"))
				.andExpect(jsonPath("$.history[1].changedBy").value("admin"))
				.andExpect(jsonPath("$.history[1].changedAt").value(org.hamcrest.Matchers
						.matchesPattern("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}")))
				.andExpect(jsonPath("$.plan.plan.type").value("COST"))
				.andExpect(jsonPath("$.plan.master.shipCount").value(3))
				.andExpect(jsonPath("$.plan.orders.CHINA").value(3000))
				.andExpect(jsonPath("$.plan.plan.stock.CHINA").isArray());
	}

	@Test
	void finalStatusHasNoNextStatusesAndMemoMayBeNull() throws Exception {
		Order order = confirm(null);
		orderService.changeStatus(order.getId(), OrderStatus.IN_PROGRESS, order.getVersion(), "admin");
		long v = orderService.getOrder(order.getId()).getVersion();
		orderService.changeStatus(order.getId(), OrderStatus.COMPLETED, v, "admin");
		mvc.perform(get("/api/orders/" + order.getId()).session(login())).andExpect(status().isOk())
				.andExpect(jsonPath("$.status.name").value("COMPLETED")).andExpect(jsonPath("$.nextStatuses").isEmpty())
				.andExpect(jsonPath("$.memo").isEmpty());
	}

	@Test
	void unknownOrderIsNotFoundWithMessage() throws Exception {
		mvc.perform(get("/api/orders/-12345").session(login())).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error").value("주문을 찾을 수 없습니다")).andExpect(jsonPath("$.conflict").value(false))
				.andExpect(jsonPath("$.errors[0]").value("주문을 찾을 수 없습니다"));
	}

	@Test
	void statusChangeOfUnknownOrderIsNotFound() throws Exception {
		mvc.perform(postJson("/api/orders/-12345/status", login(), statusBody("IN_PROGRESS", 0)))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.error").value("주문을 찾을 수 없습니다"));
	}

	@Test
	void costGettersAreFormattedInEokWithTwoDecimals() {
		Order order = confirm(null);
		assertThat(order.getTotalCostEok()).isEqualTo(String.format("%.2f", order.getTotalCost() / 1e8));
		assertThat(order.getProductionCostEok()).matches("\\d+\\.\\d{2}");
		assertThat(order.getShippingCostEok()).matches("\\d+\\.\\d{2}");
	}

	// ---------------------------------------------------------------- 상태 변경

	private String statusBody(String status, long version) {
		return "{\"status\":\"" + status + "\",\"version\":" + version + "}";
	}

	@Test
	void statusChangeReturnsMessageAndChangesTheOrder() throws Exception {
		Order order = confirm(null);
		mvc.perform(postJson("/api/orders/" + order.getId() + "/status", login(), statusBody("IN_PROGRESS", order.getVersion())))
				.andExpect(status().isOk()).andExpect(jsonPath("$.message").value("상태를 '진행'(으)로 바꿨습니다"));
		assertThat(orderService.getOrder(order.getId()).getStatus()).isEqualTo(OrderStatus.IN_PROGRESS);
	}

	@Test
	void notAllowedStatusChangeIsABadRequestWithReason() throws Exception {
		Order order = confirm(null);
		mvc.perform(postJson("/api/orders/" + order.getId() + "/status", login(), statusBody("COMPLETED", order.getVersion())))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("확정 상태에서는 완료(으)로 바꿀 수 없습니다"))
				.andExpect(jsonPath("$.conflict").value(false));
		assertThat(orderService.getOrder(order.getId()).getStatus()).isEqualTo(OrderStatus.CONFIRMED);
	}

	@Test
	void staleVersionIsAConflict() throws Exception {
		Order order = confirm(null);
		orderService.changeStatus(order.getId(), OrderStatus.IN_PROGRESS, order.getVersion(), "other");
		mvc.perform(postJson("/api/orders/" + order.getId() + "/status", login(), statusBody("CANCELED", order.getVersion())))
				.andExpect(status().isConflict()).andExpect(jsonPath("$.conflict").value(true))
				.andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("먼저 이 주문을 변경했습니다")));
	}

	@Test
	void statusChangeRecordsTheLoggedInUser() throws Exception {
		Order order = confirm(null);
		mvc.perform(postJson("/api/orders/" + order.getId() + "/status", login(), statusBody("IN_PROGRESS", order.getVersion())))
				.andExpect(status().isOk());
		assertThat(orderService.history(order.getId()).get(1).getChangedBy()).isEqualTo("admin");
	}

	/** 취소해도 주문은 지워지지 않고 '취소' 상태의 최종 상태로 남아, 상세·목록에서 계속 볼 수 있다. */
	@Test
	void canceledOrderStaysVisibleAsFinalState() throws Exception {
		Order order = confirm("취소할 주문");
		MockHttpSession s = login();
		mvc.perform(postJson("/api/orders/" + order.getId() + "/status", s, statusBody("CANCELED", order.getVersion())))
				.andExpect(status().isOk()).andExpect(jsonPath("$.message").value("상태를 '취소'(으)로 바꿨습니다"));
		assertThat(orderService.history(order.getId()).get(1).getChangedBy()).isEqualTo("admin");

		mvc.perform(get("/api/orders/" + order.getId()).session(s)).andExpect(status().isOk())
				.andExpect(jsonPath("$.status.name").value("CANCELED")).andExpect(jsonPath("$.status.label").value("취소"))
				.andExpect(jsonPath("$.nextStatuses").isEmpty()).andExpect(jsonPath("$.memo").value("취소할 주문"))
				.andExpect(jsonPath("$.history.length()").value(2))
				.andExpect(jsonPath("$.history[1].to.label").value("취소"));
		MvcResult res = mvc.perform(get("/api/orders").param("status", "CANCELED").session(s)).andExpect(status().isOk()).andReturn();
		JsonNode body = json.readTree(res.getResponse().getContentAsString(StandardCharsets.UTF_8));
		assertThat(body.get("counts").get("CANCELED").asLong()).isGreaterThanOrEqualTo(1);
		assertThat(body.get("orders")).anyMatch(o -> o.get("id").asLong() == order.getId());
		// 취소된 주문은 다시 바꿀 수 없다
		mvc.perform(postJson("/api/orders/" + order.getId() + "/status", s, statusBody("IN_PROGRESS", orderService.getOrder(order.getId()).getVersion())))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("취소 상태에서는 진행(으)로 바꿀 수 없습니다"));
	}

	@Test
	void unknownStatusValueIsABadRequest() throws Exception {
		Order order = confirm(null);
		mvc.perform(postJson("/api/orders/" + order.getId() + "/status", login(), statusBody("NOPE", order.getVersion())))
				.andExpect(status().isBadRequest());
	}

	// ---------------------------------------------------------------- 마스터

	@Test
	void masterFormHasCurrentValues() throws Exception {
		MvcResult res = mvc.perform(get("/api/master/form").session(login())).andExpect(status().isOk()).andReturn();
		JsonNode form = json.readTree(res.getResponse().getContentAsString(StandardCharsets.UTF_8));
		assertThat(form.get("shipCount").asString()).isEqualTo("3");
		assertThat(form.get("shipDailyCost").asString()).isEqualTo("1");
		assertThat(form.get("maxDaily_CHINA").asString()).isEqualTo("400");
		assertThat(form.get("stockLimit_CHINA").asString()).isEqualTo("4000");
		assertThat(form.get("unitCost_CHINA").asString()).isEqualTo("700");
		assertThat(form.get("maxDaily_JAPAN").asString()).isEqualTo("800");
		assertThat(form.get("days_KOREA_CHINA").asString()).isEqualTo("1");
		assertThat(form.get("days_VIETNAM_INDONESIA").asString()).isEqualTo("2");
		assertThat(form.size()).isEqualTo(1 + 1 + 4 * 4 + 10);
	}

	@Test
	void masterFormShowsEokWithoutTrailingZeros() throws Exception {
		Map<String, String> changed = new HashMap<>(originalForm);
		changed.put("shipDailyCost", "1.25");
		masters.updateMaster(changed);
		mvc.perform(get("/api/master/form").session(login())).andExpect(jsonPath("$.shipDailyCost").value("1.25"));
		changed.put("shipDailyCost", "10");
		masters.updateMaster(changed);
		mvc.perform(get("/api/master/form").session(login())).andExpect(jsonPath("$.shipDailyCost").value("10"));
	}

	@Test
	void validMasterIsSavedWithMessage() throws Exception {
		Map<String, String> form = new HashMap<>(originalForm);
		form.put("shipCount", "2");
		mvc.perform(postJson("/api/master", login(), json.writeValueAsString(form))).andExpect(status().isOk())
				.andExpect(jsonPath("$.message").value("마스터 데이터를 저장했습니다"));
		assertThat(masters.currentMaster().shipCount()).isEqualTo(2);
	}

	@Test
	void invalidMasterReportsEveryReasonAndSavesNothing() throws Exception {
		long before = masters.currentMaster().version();
		mvc.perform(postJson("/api/master", login(), "{\"shipCount\":\"9\",\"shipDailyCost\":\"abc\"}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.conflict").value(false))
				.andExpect(jsonPath("$.errors.length()").value(28))
				.andExpect(jsonPath("$.errors[0]").value("배 척수은(는) 1 이상 4 이하의 정수여야 합니다"))
				.andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.startsWith("배 척수은(는) 1 이상 4 이하의 정수여야 합니다 / ")));
		assertThat(masters.currentMaster().version()).isEqualTo(before);
	}

	@Test
	void apiMasterReturnsSnapshotFields() throws Exception {
		mvc.perform(get("/api/master").session(login())).andExpect(status().isOk())
				.andExpect(jsonPath("$.shipCount").value(3)).andExpect(jsonPath("$.shipDailyCostWon").value(100_000_000))
				.andExpect(jsonPath("$.factories.length()").value(4)).andExpect(jsonPath("$.routes.length()").value(10))
				.andExpect(jsonPath("$.factories[0].country").value("CHINA"))
				.andExpect(jsonPath("$.factories[0].stockLimit").value(4000))
				.andExpect(jsonPath("$.routes[0].from").value("KOREA"));
	}

	// ---------------------------------------------------------------- 시뮬레이션·확정

	@Test
	void simulateErrorsAreBadRequestWithoutConflictFlag() throws Exception {
		mvc.perform(postJson("/api/simulate", login(), "{\"orders\":{\"CHINA\":-3}}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("중국 주문 수량은 0 이상이어야 합니다"))
				.andExpect(jsonPath("$.conflict").value(false));
		mvc.perform(postJson("/api/simulate", login(), "{\"orders\":{\"CHINA\":100001}}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("총 생산 필요 수는 100,000K 이하여야 합니다"));
	}

	@Test
	void confirmReturnsIdAndSavesOrder() throws Exception {
		MockHttpSession s = login();
		long version = masters.currentMaster().version();
		MvcResult res = mvc.perform(postJson("/api/orders", s, "{\"orders\":" + ORDERS + ",\"routeType\":\"NEAR\",\"masterVersion\":"
						+ version + ",\"memo\":\"api\"}"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.id").isNumber()).andReturn();
		long id = json.readTree(res.getResponse().getContentAsString()).get("id").asLong();
		Order saved = orderService.getOrder(id);
		assertThat(saved.getRouteType()).isEqualTo("NEAR");
		assertThat(saved.getCreatedBy()).isEqualTo("admin");
		assertThat(saved.getMemo()).isEqualTo("api");
	}

	@Test
	void confirmErrorsMapToStatusCodes() throws Exception {
		MockHttpSession s = login();
		long version = masters.currentMaster().version();
		mvc.perform(postJson("/api/orders", s, "{\"orders\":" + ORDERS + ",\"routeType\":\"SLOW\",\"masterVersion\":" + version + "}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("선택한 경로를 찾을 수 없습니다"))
				.andExpect(jsonPath("$.conflict").value(false));
		mvc.perform(postJson("/api/orders", s, "{\"orders\":" + ORDERS + ",\"routeType\":\"COST\",\"masterVersion\":" + (version - 1) + "}"))
				.andExpect(status().isConflict()).andExpect(jsonPath("$.conflict").value(true))
				.andExpect(jsonPath("$.error").value("시뮬레이션 이후 마스터 데이터가 바뀌었습니다. 다시 시뮬레이션해 주세요"));
		mvc.perform(postJson("/api/orders", s, "{\"orders\":" + ORDERS + ",\"routeType\":\"COST\",\"masterVersion\":" + version
						+ ",\"memo\":\"" + "가".repeat(1001) + "\"}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("메모는 1000자 이하로 입력하세요"));
	}

	/**
	 * 기본 마스터·기본 주문의 시뮬레이션 응답 전체(JSON)를 기준 파일과 비교한다. 필드 이름, 경로 유형 값,
	 * 배열·맵 모양이 바뀌면 화면 스크립트가 깨지므로 정리 후에도 같아야 한다.
	 */
	@Test
	void simulateResponseMatchesTheRecordedGolden() throws Exception {
		MvcResult res = mvc.perform(postJson("/api/simulate", login(), "{\"orders\":" + ORDERS + "}"))
				.andExpect(status().isOk()).andReturn();
		JsonNode actual = json.readTree(res.getResponse().getContentAsString(StandardCharsets.UTF_8));
		// 마스터 버전은 다른 테스트가 마스터를 바꾸면 달라지므로 비교에서 뺀다
		((ObjectNode) actual.get("master")).remove("version");
		if ("true".equals(System.getenv("GOLDEN_UPDATE"))) {
			Files.createDirectories(SIMULATE_GOLDEN_SOURCE.getParent());
			assertThat(System.getenv("CI")).as("CI 에서는 GOLDEN_UPDATE 를 쓸 수 없습니다").isNull();
			Files.writeString(SIMULATE_GOLDEN_SOURCE, json.writerWithDefaultPrettyPrinter().writeValueAsString(actual),
					StandardCharsets.UTF_8);
			assumeTrue(false, "기준 파일을 다시 만들었습니다. git diff 로 바뀐 내용을 확인하세요");
		}
		try (InputStream in = getClass().getClassLoader().getResourceAsStream(SIMULATE_GOLDEN)) {
			assertThat(in).as("기준 파일 %s 이 없습니다. 환경변수 GOLDEN_UPDATE=true 로 한 번 만드세요", SIMULATE_GOLDEN).isNotNull();
			JsonNode expected = json.readTree(new String(in.readAllBytes(), StandardCharsets.UTF_8));
			assertThat(actual).isEqualTo(expected);
		}
	}

	@Test
	void storedPlanOfConfirmedOrderKeepsTheSameJsonShape() throws Exception {
		Order order = confirm(null);
		JsonNode stored = json.readTree(order.getPlanJson());
		assertThat(stored.propertyNames()).containsExactlyInAnyOrder("master", "orders", "visits", "plan");
		assertThat(stored.get("plan").propertyNames()).containsExactlyInAnyOrder("type", "label", "totalDays",
				"productionCost", "shippingCost", "operatingCost", "totalCost", "ships", "stock", "production");
		assertThat(stored.get("master").get("version").asLong()).isEqualTo(masters.currentMaster().version());
	}

	/** 주문 상세 API 의 plan 은 확정 때 저장한 JSON 과 같아야 한다(화면의 계획 표시가 그대로 동작하는 조건). */
	@Test
	void detailPlanEqualsTheStoredPlanJson() throws Exception {
		Order order = confirm(null);
		MvcResult res = mvc.perform(get("/api/orders/" + order.getId()).session(login())).andExpect(status().isOk()).andReturn();
		JsonNode plan = json.readTree(res.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("plan");
		assertThat(plan).isEqualTo(json.readTree(order.getPlanJson()));
	}
}
