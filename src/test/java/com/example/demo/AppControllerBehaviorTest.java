package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.flash;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.model;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.service.MasterService;
import com.example.demo.service.OrderService;
import com.example.demo.simulation.Master;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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
 * 화면(HTML)과 JSON API 의 응답을 확인한다. 컨트롤러·서비스를 정리한 뒤에도 같은 응답이 나와야 한다.
 * 실제 서버 설정(로그인 검사 포함)으로 돌리며 목(mock)은 쓰지 않는다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AppControllerBehaviorTest {

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
		originalForm = ServiceBehaviorTest.formOf(masters.currentMaster());
	}

	@AfterEach
	void restoreMaster() {
		masters.updateMaster(originalForm);
	}

	private MockHttpSession login() throws Exception {
		MockHttpSession session = new MockHttpSession();
		mvc.perform(post("/login").param("username", "admin").param("password", "admin").session(session))
				.andExpect(redirectedUrl("/orders"));
		return session;
	}

	private MockHttpServletRequestBuilder postJson(String url, MockHttpSession s, String body) {
		return post(url).session(s).contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private Order confirm(String memo) {
		return orderService.confirm(ServiceBehaviorTest.orders(3000, 3000, 3000, 3000), "COST",
				masters.currentMaster().version(), memo, "admin");
	}

	// ---------------------------------------------------------------- 로그인

	@Test
	void homeRedirectsToOrders() throws Exception {
		mvc.perform(get("/").session(login())).andExpect(redirectedUrl("/orders"));
	}

	@Test
	void loginPageRedirectsWhenAlreadyLoggedIn() throws Exception {
		mvc.perform(get("/login").session(login())).andExpect(redirectedUrl("/orders"));
		mvc.perform(get("/login")).andExpect(status().isOk()).andExpect(view().name("login"));
	}

	@Test
	void wrongLoginShowsMessageOnLoginPage() throws Exception {
		mvc.perform(post("/login").param("username", "admin").param("password", "nope"))
				.andExpect(status().isOk()).andExpect(view().name("login"))
				.andExpect(model().attribute("error", "아이디 또는 비밀번호가 올바르지 않습니다"));
		mvc.perform(post("/login").param("username", "root").param("password", "admin"))
				.andExpect(model().attribute("error", "아이디 또는 비밀번호가 올바르지 않습니다"));
	}

	@Test
	void logoutGoesToLoginAndLoginUserIsShownInModel() throws Exception {
		MockHttpSession s = login();
		mvc.perform(get("/orders").session(s)).andExpect(model().attribute("loginUser", "admin"));
		mvc.perform(post("/logout").session(s)).andExpect(redirectedUrl("/login"));
	}

	@Test
	void everyPageNeedsLogin() throws Exception {
		for (String url : new String[] {"/orders", "/orders/new", "/orders/1", "/master"}) {
			mvc.perform(get(url)).andExpect(redirectedUrl("/login"));
		}
		mvc.perform(post("/master")).andExpect(redirectedUrl("/login"));
		mvc.perform(post("/orders/1/status").param("status", "IN_PROGRESS").param("version", "0"))
				.andExpect(redirectedUrl("/login"));
		mvc.perform(get("/api/master")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isUnauthorized());
	}

	// ---------------------------------------------------------------- 주문 목록·상세

	@Test
	void listModelHasOrdersCountsTotalAndStatuses() throws Exception {
		Order order = confirm("목록 확인");
		MvcResult res = mvc.perform(get("/orders").session(login()))
				.andExpect(status().isOk()).andExpect(view().name("orders"))
				.andExpect(model().attributeExists("orders", "counts", "total", "statuses"))
				.andExpect(model().attribute("status", (Object) null))
				.andExpect(content().string(org.hamcrest.Matchers.containsString("/orders/" + order.getId())))
				.andReturn();
		Map<String, Object> model = res.getModelAndView().getModel();
		assertThat((List<?>) model.get("orders")).hasSize(orderService.listOrders(null).size());
		assertThat(model.get("total")).isEqualTo(orderService.listOrders(null).size());
		assertThat((OrderStatus[]) model.get("statuses")).containsExactly(OrderStatus.values());
		assertThat(model.get("counts")).isEqualTo(orderService.countByStatus());
	}

	@Test
	void listCanBeFilteredByStatusButTotalStaysAll() throws Exception {
		Order running = confirm(null);
		orderService.changeStatus(running.getId(), OrderStatus.IN_PROGRESS, running.getVersion(), "admin");
		confirm(null);
		MvcResult res = mvc.perform(get("/orders").param("status", "IN_PROGRESS").session(login()))
				.andExpect(status().isOk()).andExpect(model().attribute("status", OrderStatus.IN_PROGRESS)).andReturn();
		Map<String, Object> model = res.getModelAndView().getModel();
		List<?> shown = (List<?>) model.get("orders");
		assertThat(shown).isNotEmpty().allMatch(o -> ((Order) o).getStatus() == OrderStatus.IN_PROGRESS);
		assertThat(model.get("total")).isEqualTo(orderService.listOrders(null).size());
		assertThat((int) model.get("total")).isGreaterThan(shown.size());
	}

	@Test
	void unknownStatusFilterIsABadRequest() throws Exception {
		mvc.perform(get("/orders").param("status", "NOPE").session(login())).andExpect(status().isBadRequest());
	}

	@Test
	void newOrderPageHasMasterInModel() throws Exception {
		mvc.perform(get("/orders/new").session(login())).andExpect(status().isOk())
				.andExpect(view().name("order-new")).andExpect(model().attribute("master", masters.currentMaster()));
	}

	@Test
	void detailShowsOrderHistoryAndMemo() throws Exception {
		Order order = confirm("상세 확인용 메모");
		orderService.changeStatus(order.getId(), OrderStatus.IN_PROGRESS, order.getVersion(), "admin");
		MvcResult res = mvc.perform(get("/orders/" + order.getId()).session(login()))
				.andExpect(status().isOk()).andExpect(view().name("order-detail"))
				.andExpect(model().attributeExists("order", "history"))
				.andExpect(content().string(org.hamcrest.Matchers.containsString("상세 확인용 메모")))
				.andReturn();
		assertThat((List<?>) res.getModelAndView().getModel().get("history")).hasSize(2);
		assertThat(((Order) res.getModelAndView().getModel().get("order")).getStatus()).isEqualTo(OrderStatus.IN_PROGRESS);
	}

	@Test
	void costGettersAreFormattedInEokWithTwoDecimals() {
		Order order = confirm(null);
		assertThat(order.getTotalCostEok()).isEqualTo(String.format("%.2f", order.getTotalCost() / 1e8));
		assertThat(order.getProductionCostEok()).matches("\\d+\\.\\d{2}");
		assertThat(order.getShippingCostEok()).matches("\\d+\\.\\d{2}");
	}

	// ---------------------------------------------------------------- 상태 변경 화면

	@Test
	void statusChangeRedirectsToDetailWithMessage() throws Exception {
		Order order = confirm(null);
		mvc.perform(post("/orders/" + order.getId() + "/status").session(login()).param("status", "IN_PROGRESS")
						.param("version", String.valueOf(order.getVersion())))
				.andExpect(redirectedUrl("/orders/" + order.getId()))
				.andExpect(flash().attribute("message", "상태를 '진행'(으)로 바꿨습니다"))
				.andExpect(flash().attributeCount(1));
		assertThat(orderService.getOrder(order.getId()).getStatus()).isEqualTo(OrderStatus.IN_PROGRESS);
	}

	@Test
	void notAllowedStatusChangeShowsErrorMessageOnDetail() throws Exception {
		Order order = confirm(null);
		mvc.perform(post("/orders/" + order.getId() + "/status").session(login()).param("status", "COMPLETED")
						.param("version", String.valueOf(order.getVersion())))
				.andExpect(redirectedUrl("/orders/" + order.getId()))
				.andExpect(flash().attribute("error", "확정 상태에서는 완료(으)로 바꿀 수 없습니다"))
				.andExpect(flash().attributeCount(1));
	}

	@Test
	void staleVersionShowsConflictMessageOnDetail() throws Exception {
		Order order = confirm(null);
		orderService.changeStatus(order.getId(), OrderStatus.IN_PROGRESS, order.getVersion(), "other");
		MvcResult res = mvc.perform(post("/orders/" + order.getId() + "/status").session(login())
						.param("status", "CANCELED").param("version", String.valueOf(order.getVersion())))
				.andExpect(redirectedUrl("/orders/" + order.getId())).andReturn();
		assertThat((String) res.getFlashMap().get("error")).contains("먼저 이 주문을 변경했습니다");
	}

	@Test
	void statusChangeRecordsTheLoggedInUser() throws Exception {
		Order order = confirm(null);
		mvc.perform(post("/orders/" + order.getId() + "/status").session(login()).param("status", "CANCELED")
				.param("version", String.valueOf(order.getVersion())));
		assertThat(orderService.history(order.getId()).get(1).getChangedBy()).isEqualTo("admin");
	}

	// ---------------------------------------------------------------- 마스터 화면

	@Test
	void masterPageFillsFormFromCurrentMaster() throws Exception {
		MvcResult res = mvc.perform(get("/master").session(login())).andExpect(status().isOk())
				.andExpect(view().name("master")).andExpect(model().attributeExists("form", "factories", "countries"))
				.andReturn();
		Map<String, Object> model = res.getModelAndView().getModel();
		@SuppressWarnings("unchecked")
		Map<String, String> form = (Map<String, String>) model.get("form");
		assertThat(form).containsEntry("shipCount", "3").containsEntry("shipDailyCost", "1")
				.containsEntry("maxDaily_CHINA", "400").containsEntry("stockLimit_CHINA", "4000")
				.containsEntry("unitCost_CHINA", "700").containsEntry("maxDaily_JAPAN", "800")
				.containsEntry("days_KOREA_CHINA", "1").containsEntry("days_VIETNAM_INDONESIA", "2");
		assertThat(form).hasSize(1 + 1 + 4 * 3 + 10);
		assertThat((List<?>) model.get("factories")).isEqualTo(Country.factories());
		assertThat((Country[]) model.get("countries")).containsExactly(Country.values());
	}

	@Test
	void masterFormShowsEokWithoutTrailingZeros() throws Exception {
		Map<String, String> changed = new java.util.HashMap<>(originalForm);
		changed.put("shipDailyCost", "1.25");
		masters.updateMaster(changed);
		MvcResult res = mvc.perform(get("/master").session(login())).andReturn();
		@SuppressWarnings("unchecked")
		Map<String, String> form = (Map<String, String>) res.getModelAndView().getModel().get("form");
		assertThat(form.get("shipDailyCost")).isEqualTo("1.25");
		changed.put("shipDailyCost", "10");
		masters.updateMaster(changed);
		res = mvc.perform(get("/master").session(login())).andReturn();
		@SuppressWarnings("unchecked")
		Map<String, String> form2 = (Map<String, String>) res.getModelAndView().getModel().get("form");
		assertThat(form2.get("shipDailyCost")).isEqualTo("10");
	}

	@Test
	void invalidMasterRedisplaysFormWithAllErrorsAndSavesNothing() throws Exception {
		long before = masters.currentMaster().version();
		MvcResult res = mvc.perform(post("/master").session(login()).param("shipCount", "9").param("shipDailyCost", "abc"))
				.andExpect(status().isOk()).andExpect(view().name("master"))
				.andExpect(model().attributeExists("errors", "form", "factories", "countries")).andReturn();
		Map<String, Object> model = res.getModelAndView().getModel();
		assertThat((List<?>) model.get("errors")).hasSize(24).first()
				.isEqualTo("배 척수은(는) 1 이상 4 이하의 정수여야 합니다");
		@SuppressWarnings("unchecked")
		Map<String, String> echoed = (Map<String, String>) model.get("form");
		assertThat(echoed).containsEntry("shipCount", "9").containsEntry("shipDailyCost", "abc");
		assertThat(masters.currentMaster().version()).isEqualTo(before);
	}

	@Test
	void validMasterRedirectsWithMessage() throws Exception {
		MockHttpServletRequestBuilder req = post("/master").session(login());
		Map<String, String> form = new java.util.HashMap<>(originalForm);
		form.put("shipCount", "2");
		form.forEach(req::param);
		mvc.perform(req).andExpect(redirectedUrl("/master"))
				.andExpect(flash().attribute("message", "마스터 데이터를 저장했습니다"));
		assertThat(masters.currentMaster().shipCount()).isEqualTo(2);
	}

	// ---------------------------------------------------------------- JSON API

	@Test
	void apiMasterReturnsSnapshotFields() throws Exception {
		mvc.perform(get("/api/master").session(login())).andExpect(status().isOk())
				.andExpect(jsonPath("$.shipCount").value(3)).andExpect(jsonPath("$.shipDailyCostWon").value(100_000_000))
				.andExpect(jsonPath("$.factories.length()").value(4)).andExpect(jsonPath("$.routes.length()").value(10))
				.andExpect(jsonPath("$.factories[0].country").value("CHINA"))
				.andExpect(jsonPath("$.factories[0].stockLimit").value(4000))
				.andExpect(jsonPath("$.routes[0].from").value("KOREA"));
	}

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
				"productionCost", "shippingCost", "totalCost", "ships", "stock", "production");
		Master master = masters.currentMaster();
		assertThat(stored.get("master").get("version").asLong()).isEqualTo(master.version());
	}
}
