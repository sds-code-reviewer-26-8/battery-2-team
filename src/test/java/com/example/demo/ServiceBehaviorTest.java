package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.entity.OrderStatusHistory;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MasterService;
import com.example.demo.service.NotFoundException;
import com.example.demo.service.OrderService;
import com.example.demo.service.SimulationService;
import com.example.demo.service.SimulationService.SimulationResult;
import com.example.demo.simulation.Master;
import com.example.demo.simulation.Plan;
import com.example.demo.simulation.Planner;
import com.example.demo.simulation.StoredPlan;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * 서비스 의 동작을 실제 DB(인메모리 H2)로 확인한다. 리팩토링 전후에 같은 결과가 나와야 한다.
 * 목(mock)은 쓰지 않는다. 다른 테스트가 만든 주문이 DB 에 남아 있을 수 있어, 주문 개수는 "전후 차이"로 비교한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ServiceBehaviorTest {

	@Autowired
	MasterService masters;
	@Autowired
	SimulationService simulations;
	@Autowired
	OrderService orderService;
	@Autowired
	com.example.demo.repository.OrderRepository orderRepository;
	@Autowired
	ObjectMapper json;

	private Map<String, String> originalForm;

	@BeforeEach
	void rememberMaster() {
		originalForm = formOf(masters.currentMaster());
	}

	/** 마스터를 바꾸는 테스트가 다른 테스트에 영향을 주지 않도록 값을 되돌린다(버전 숫자는 올라간다). */
	@AfterEach
	void restoreMaster() {
		masters.updateMaster(originalForm);
	}

	static Map<Country, Integer> orders(int china, int japan, int vietnam, int indonesia) {
		Map<Country, Integer> m = new EnumMap<>(Country.class);
		m.put(Country.CHINA, china);
		m.put(Country.JAPAN, japan);
		m.put(Country.VIETNAM, vietnam);
		m.put(Country.INDONESIA, indonesia);
		return m;
	}

	/** 화면의 마스터 입력칸과 같은 이름의 값들 */
	static Map<String, String> formOf(Master m) {
		Map<String, String> form = new HashMap<>();
		for (Master.FactoryParam f : m.factories()) {
			form.put("maxDaily_" + f.country(), String.valueOf(f.maxDaily()));
			form.put("stockLimit_" + f.country(), String.valueOf(f.stockLimit()));
			form.put("unitCost_" + f.country(), String.valueOf(f.unitCost()));
		}
		for (Master.RouteParam r : m.routes()) {
			form.put(MasterService.routeKey(r.from(), r.to()), String.valueOf(r.days()));
		}
		form.put("shipCount", String.valueOf(m.shipCount()));
		form.put("shipDailyCost", String.valueOf(m.shipDailyCostWon() / 100_000_000.0));
		return form;
	}

	private Map<String, String> validForm() {
		return new HashMap<>(originalForm);
	}

	private Order confirmDefault(String routeType, String memo) {
		Master master = masters.currentMaster();
		return orderService.confirm(orders(3000, 3000, 3000, 3000), routeType, master.version(), memo, "테스트고객", "tester");
	}

	// ---------------------------------------------------------------- 마스터 데이터

	@Test
	void initialMasterHasDefaultValues() {
		Master m = masters.currentMaster();
		assertThat(m.shipCount()).isEqualTo(3);
		assertThat(m.shipDailyCostWon()).isEqualTo(MasterService.WON_PER_EOK);
		assertThat(m.factories()).extracting(Master.FactoryParam::country)
				.containsExactly(Country.CHINA, Country.JAPAN, Country.VIETNAM, Country.INDONESIA);
		assertThat(m.factory(Country.CHINA)).isEqualTo(new Master.FactoryParam(Country.CHINA, 400, 4000, 700));
		assertThat(m.factory(Country.JAPAN)).isEqualTo(new Master.FactoryParam(Country.JAPAN, 800, 2000, 900));
		assertThat(m.factory(Country.VIETNAM)).isEqualTo(new Master.FactoryParam(Country.VIETNAM, 200, 10000, 550));
		assertThat(m.factory(Country.INDONESIA)).isEqualTo(new Master.FactoryParam(Country.INDONESIA, 300, 7000, 450));
		assertThat(m.routes()).hasSize(10);
		assertThat(m.days(Country.KOREA, Country.INDONESIA)).isEqualTo(7);
		assertThat(m.days(Country.VIETNAM, Country.INDONESIA)).isEqualTo(2);
	}

	@Test
	void routesAreSortedByFromThenTo() {
		List<Master.RouteParam> routes = masters.currentMaster().routes();
		assertThat(routes.get(0)).extracting(Master.RouteParam::from, Master.RouteParam::to)
				.containsExactly(Country.KOREA, Country.CHINA);
		assertThat(routes.get(9)).extracting(Master.RouteParam::from, Master.RouteParam::to)
				.containsExactly(Country.VIETNAM, Country.INDONESIA);
	}

	@Test
	void routeKeyDoesNotDependOnArgumentOrder() {
		assertThat(MasterService.routeKey(Country.CHINA, Country.JAPAN)).isEqualTo("days_CHINA_JAPAN");
		assertThat(MasterService.routeKey(Country.JAPAN, Country.CHINA)).isEqualTo("days_CHINA_JAPAN");
		assertThat(MasterService.routeKey(Country.INDONESIA, Country.KOREA)).isEqualTo("days_KOREA_INDONESIA");
	}

	@Test
	void validMasterUpdateIsSavedAndBumpsVersionByOne() {
		long before = masters.currentMaster().version();
		Map<String, String> form = validForm();
		form.put("shipCount", "4");
		form.put("shipDailyCost", "1.5");
		form.put("maxDaily_CHINA", "1,000");
		form.put("stockLimit_JAPAN", "2500");
		form.put("unitCost_VIETNAM", "650");
		form.put("days_CHINA_JAPAN", "9");
		masters.updateMaster(form);

		Master after = masters.currentMaster();
		assertThat(after.version()).isEqualTo(before + 1);
		assertThat(after.shipCount()).isEqualTo(4);
		assertThat(after.shipDailyCostWon()).isEqualTo(150_000_000L);
		assertThat(after.factory(Country.CHINA).maxDaily()).isEqualTo(1000);
		assertThat(after.factory(Country.JAPAN).stockLimit()).isEqualTo(2500);
		assertThat(after.factory(Country.VIETNAM).unitCost()).isEqualTo(650);
		assertThat(after.days(Country.JAPAN, Country.CHINA)).isEqualTo(9);
		// 바꾸지 않은 값은 그대로
		assertThat(after.factory(Country.INDONESIA)).isEqualTo(new Master.FactoryParam(Country.INDONESIA, 300, 7000, 450));
	}

	@Test
	void emptyFormReportsEveryProblemAtOnceAndSavesNothing() {
		long before = masters.currentMaster().version();
		assertThatThrownBy(() -> masters.updateMaster(Map.of())).isInstanceOfSatisfying(BusinessException.class, e -> {
			assertThat(e.isConflict()).isFalse();
			// 배 척수 1 + 운항비 1 + 공장 4곳 x 3 + 항로 10 = 24
			assertThat(e.getMessages()).hasSize(24);
			assertThat(e.getMessages().get(0)).isEqualTo("배 척수은(는) 정수로 입력하세요");
			assertThat(e.getMessages().get(1)).isEqualTo("척당 일 운항비(억 원)는 숫자로 입력하세요");
			assertThat(e.getMessages().get(2)).isEqualTo("중국 하루 최대 생산량은(는) 정수로 입력하세요");
			assertThat(e.getMessages().get(3)).isEqualTo("중국 재고 상한은(는) 정수로 입력하세요");
			assertThat(e.getMessages().get(4)).isEqualTo("중국 셀당 원가은(는) 정수로 입력하세요");
			assertThat(e.getMessages().get(14)).isEqualTo("한국-중국 항해 일수은(는) 정수로 입력하세요");
			assertThat(e.getMessages().get(23)).isEqualTo("베트남-인도네시아 항해 일수은(는) 정수로 입력하세요");
			assertThat(e.getMessage()).startsWith("배 척수은(는) 정수로 입력하세요 / ");
		});
		assertThat(masters.currentMaster().version()).isEqualTo(before);
	}

	@Test
	void numberRangesAreChecked() {
		assertMasterError("shipCount", "0", "배 척수은(는) 1 이상 4 이하의 정수여야 합니다");
		assertMasterError("shipCount", "5", "배 척수은(는) 1 이상 4 이하의 정수여야 합니다");
		assertMasterError("maxDaily_CHINA", "1000001", "중국 하루 최대 생산량은(는) 1 이상 1000000 이하의 정수여야 합니다");
		assertMasterError("stockLimit_JAPAN", "0", "일본 재고 상한은(는) 1 이상 1000000 이하의 정수여야 합니다");
		assertMasterError("unitCost_VIETNAM", "100000001", "베트남 셀당 원가은(는) 1 이상 100000000 이하의 정수여야 합니다");
		assertMasterError("days_KOREA_CHINA", "366", "한국-중국 항해 일수은(는) 1 이상 365 이하의 정수여야 합니다");
		assertMasterError("days_KOREA_CHINA", "1.5", "한국-중국 항해 일수은(는) 정수로 입력하세요");
	}

	@Test
	void boundaryValuesAreAccepted() {
		Map<String, String> form = validForm();
		form.put("shipCount", "1");
		form.put("maxDaily_CHINA", "1");
		form.put("stockLimit_CHINA", "1000000");
		form.put("unitCost_CHINA", "100000000");
		form.put("days_KOREA_CHINA", "365");
		masters.updateMaster(form);
		assertThat(masters.currentMaster().shipCount()).isEqualTo(1);
		assertThat(masters.currentMaster().days(Country.KOREA, Country.CHINA)).isEqualTo(365);
	}

	@Test
	void shipDailyCostIsEokAndMustBePositiveWholeWon() {
		assertMasterError("shipDailyCost", "0", "척당 일 운항비는 0보다 커야 합니다");
		assertMasterError("shipDailyCost", "-1", "척당 일 운항비는 0보다 커야 합니다");
		assertMasterError("shipDailyCost", "abc", "척당 일 운항비(억 원)는 숫자로 입력하세요");
		assertMasterError("shipDailyCost", "0.000000001", "척당 일 운항비는 원 단위로 떨어지는 값이어야 합니다");
		Map<String, String> form = validForm();
		form.put("shipDailyCost", "0.5");
		masters.updateMaster(form);
		assertThat(masters.currentMaster().shipDailyCostWon()).isEqualTo(50_000_000L);
	}

	private void assertMasterError(String key, String value, String message) {
		Map<String, String> form = validForm();
		form.put(key, value);
		long before = masters.currentMaster().version();
		assertThatThrownBy(() -> masters.updateMaster(form)).isInstanceOfSatisfying(BusinessException.class,
				e -> assertThat(e.getMessages()).containsExactly(message));
		assertThat(masters.currentMaster().version()).as("저장되지 않아야 함: %s=%s", key, value).isEqualTo(before);
	}

	// ---------------------------------------------------------------- 시뮬레이션

	@Test
	void simulateReturnsThreeOptionsInFixedOrderWithSameMasterVersion() {
		SimulationResult r = simulations.simulate(orders(3000, 3000, 3000, 3000));
		assertThat(r.options()).extracting(Plan::type).containsExactly("COST", "FAST", "NEAR");
		assertThat(r.options()).extracting(Plan::label).containsExactly("운항비 최소", "가장 빠르게", "가까운 곳부터");
		assertThat(r.master()).isEqualTo(masters.currentMaster());
		assertThat(r.visits()).containsEntry(Country.JAPAN, 2).containsEntry(Country.CHINA, 1);
	}

	@Test
	void simulateFillsMissingCountriesWithZero() {
		Map<Country, Integer> partial = new EnumMap<>(Country.class);
		partial.put(Country.CHINA, 400);
		SimulationResult r = simulations.simulate(partial);
		assertThat(r.orders()).containsOnlyKeys(Country.CHINA, Country.JAPAN, Country.VIETNAM, Country.INDONESIA);
		assertThat(r.orders()).containsEntry(Country.CHINA, 400).containsEntry(Country.JAPAN, 0);
		assertThat(r.visits()).containsEntry(Country.VIETNAM, 0);
	}

	@Test
	void simulateIgnoresKorea() {
		Map<Country, Integer> withKorea = orders(400, 0, 0, 0);
		withKorea.put(Country.KOREA, 999);
		SimulationResult r = simulations.simulate(withKorea);
		assertThat(r.orders()).doesNotContainKey(Country.KOREA);
	}

	@Test
	void simulateResultEqualsPlannerOutput() {
		Map<Country, Integer> o = orders(3000, 1000, 500, 2000);
		SimulationResult r = simulations.simulate(o);
		// Plan 에는 배열이 들어 있어 equals 로는 비교할 수 없으므로 JSON 으로 비교한다
		assertThat(json.writeValueAsString(r.options()))
				.isEqualTo(json.writeValueAsString(Planner.plan(masters.currentMaster(), o)));
	}

	@Test
	void simulateRejectsBadQuantitiesWithReason() {
		assertThatThrownBy(() -> simulations.simulate(orders(-1, 0, 0, 0))).isInstanceOf(BusinessException.class)
				.hasMessage("중국 주문 수량은 0 이상이어야 합니다");
		assertThatThrownBy(() -> simulations.simulate(orders(0, 0, -5, 0))).isInstanceOf(BusinessException.class)
				.hasMessage("베트남 주문 수량은 0 이상이어야 합니다");
		assertThatThrownBy(() -> simulations.simulate(orders(0, 0, 0, 0))).isInstanceOf(BusinessException.class)
				.hasMessage("총 생산 필요 수는 1K 이상이어야 합니다");
		assertThatThrownBy(() -> simulations.simulate(null)).isInstanceOf(BusinessException.class)
				.hasMessage("총 생산 필요 수는 1K 이상이어야 합니다");
		assertThatThrownBy(() -> simulations.simulate(orders(50_000, 50_000, 1, 0))).isInstanceOf(BusinessException.class)
				.hasMessage("총 생산 필요 수는 100,000K 이하여야 합니다");
	}

	// ---------------------------------------------------------------- 주문 확정

	@Test
	void confirmStoresServerSidePlanAndFirstHistory() throws Exception {
		Master master = masters.currentMaster();
		Order order = confirmDefault("FAST", "  첫 주문  ");

		Plan expected = Planner.plan(master, orders(3000, 3000, 3000, 3000)).get(1);
		assertThat(order.getId()).isNotNull();
		assertThat(order.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
		assertThat(order.getCreatedBy()).isEqualTo("tester");
		assertThat(order.getTotalK()).isEqualTo(12000);
		assertThat(order.getRouteType()).isEqualTo("FAST");
		assertThat(order.getRouteLabel()).isEqualTo("가장 빠르게");
		assertThat(order.getTotalDays()).isEqualTo(expected.totalDays());
		assertThat(order.getProductionCost()).isEqualTo(expected.productionCost());
		assertThat(order.getShippingCost()).isEqualTo(expected.shippingCost());
		assertThat(order.getTotalCost()).isEqualTo(expected.totalCost());
		assertThat(order.getMemo()).isEqualTo("첫 주문");

		StoredPlan stored = json.readValue(order.getPlanJson(), StoredPlan.class);
		assertThat(stored.master()).isEqualTo(master);
		assertThat(stored.orders()).isEqualTo(orders(3000, 3000, 3000, 3000));
		assertThat(stored.plan().type()).isEqualTo("FAST");
		assertThat(stored.plan().totalCost()).isEqualTo(expected.totalCost());

		List<OrderStatusHistory> history = orderService.history(order.getId());
		assertThat(history).hasSize(1);
		assertThat(history.get(0).getFromStatus()).isNull();
		assertThat(history.get(0).getToStatus()).isEqualTo(OrderStatus.CONFIRMED);
		assertThat(history.get(0).getChangedBy()).isEqualTo("tester");
	}

	@Test
	void memoIsTrimmedAndBlankBecomesNull() {
		assertThat(confirmDefault("COST", "   ").getMemo()).isNull();
		assertThat(confirmDefault("COST", "").getMemo()).isNull();
		assertThat(confirmDefault("COST", null).getMemo()).isNull();
	}

	@Test
	void memoLengthLimitIsOneThousandAfterTrim() {
		assertThat(confirmDefault("COST", "가".repeat(1000)).getMemo()).hasSize(1000);
		assertThat(confirmDefault("COST", " " + "가".repeat(1000) + " ").getMemo()).hasSize(1000);
		assertThatThrownBy(() -> confirmDefault("COST", "가".repeat(1001))).isInstanceOf(BusinessException.class)
				.hasMessage("메모는 1000자 이하로 입력하세요");
	}

	@Test
	void unknownRouteTypeIsRejected() {
		assertThatThrownBy(() -> confirmDefault("SLOW", null)).isInstanceOf(BusinessException.class)
				.hasMessage("선택한 경로를 찾을 수 없습니다")
				.satisfies(e -> assertThat(((BusinessException) e).isConflict()).isFalse());
		assertThatThrownBy(() -> confirmDefault(null, null)).isInstanceOf(BusinessException.class)
				.hasMessage("선택한 경로를 찾을 수 없습니다");
	}

	@Test
	void staleMasterVersionIsAConflictAndNothingIsSaved() {
		long count = orderService.listOrders(null).size();
		long stale = masters.currentMaster().version() - 1;
		assertThatThrownBy(() -> orderService.confirm(orders(3000, 3000, 3000, 3000), "COST", stale, null, "테스트고객", "tester"))
				.isInstanceOfSatisfying(BusinessException.class, e -> {
					assertThat(e.isConflict()).isTrue();
					assertThat(e.getMessage()).isEqualTo("시뮬레이션 이후 마스터 데이터가 바뀌었습니다. 다시 시뮬레이션해 주세요");
				});
		assertThat(orderService.listOrders(null)).hasSize((int) count);
	}

	@Test
	void confirmStillValidatesQuantities() {
		assertThatThrownBy(() -> orderService.confirm(orders(0, 0, 0, 0), "COST", masters.currentMaster().version(), null, "테스트고객", "tester"))
				.isInstanceOf(BusinessException.class).hasMessage("총 생산 필요 수는 1K 이상이어야 합니다");
	}

	@Test
	void confirmedPlanDoesNotChangeWhenMasterChangesLater() {
		Order order = confirmDefault("COST", null);
		String before = orderService.getOrder(order.getId()).getPlanJson();
		Map<String, String> form = validForm();
		form.put("shipDailyCost", "2");
		form.put("maxDaily_CHINA", "100");
		masters.updateMaster(form);
		assertThat(orderService.getOrder(order.getId()).getPlanJson()).isEqualTo(before);
	}

	// ---------------------------------------------------------------- 조회

	@Test
	void listIsNewestFirstAndCanBeFilteredByStatus() {
		Order first = confirmDefault("COST", null);
		Order second = confirmDefault("FAST", null);
		orderService.changeStatus(first.getId(), OrderStatus.IN_PROGRESS, first.getVersion(), "tester");

		List<Order> all = orderService.listOrders(null);
		assertThat(all).extracting(Order::getId).isSortedAccordingTo(java.util.Comparator.reverseOrder());
		assertThat(all.stream().map(Order::getId).toList()).contains(first.getId(), second.getId());
		assertThat(orderService.listOrders(OrderStatus.IN_PROGRESS)).extracting(Order::getId).contains(first.getId())
				.doesNotContain(second.getId());
		assertThat(orderService.listOrders(OrderStatus.CONFIRMED)).extracting(Order::getId).contains(second.getId())
				.doesNotContain(first.getId());
		assertThat(orderService.listOrders(OrderStatus.CONFIRMED)).allMatch(o -> o.getStatus() == OrderStatus.CONFIRMED);
	}

	@Test
	void countByStatusHasAllStatusesAndFollowsChanges() {
		Map<OrderStatus, Long> before = orderService.countByStatus();
		assertThat(before).containsOnlyKeys(OrderStatus.values());
		Order order = confirmDefault("COST", null);
		assertThat(orderService.countByStatus().get(OrderStatus.CONFIRMED)).isEqualTo(before.get(OrderStatus.CONFIRMED) + 1);
		orderService.changeStatus(order.getId(), OrderStatus.IN_PROGRESS, order.getVersion(), "tester");
		Map<OrderStatus, Long> after = orderService.countByStatus();
		assertThat(after.get(OrderStatus.CONFIRMED)).isEqualTo(before.get(OrderStatus.CONFIRMED));
		assertThat(after.get(OrderStatus.IN_PROGRESS)).isEqualTo(before.get(OrderStatus.IN_PROGRESS) + 1);
	}

	@Test
	void unknownOrderIsReportedWithReason() {
		assertThatThrownBy(() -> orderService.getOrder(-12345L)).isInstanceOf(NotFoundException.class)
				.isInstanceOf(BusinessException.class).hasMessage("주문을 찾을 수 없습니다");
		assertThat(orderService.history(-12345L)).isEmpty();
	}

	// ---------------------------------------------------------------- 고객사

	private Order confirmWithCustomer(String customer) {
		return orderService.confirm(orders(3000, 3000, 3000, 3000), "COST", masters.currentMaster().version(), null,
				customer, "tester");
	}

	@Test
	void confirmStoresTrimmedCustomerName() {
		Order order = confirmWithCustomer("  ㈜한빛  ");
		assertThat(orderService.getOrder(order.getId()).getCustomerName()).isEqualTo("㈜한빛");
	}

	@Test
	void blankCustomerNameIsRejectedOnConfirm() {
		int count = orderService.listOrders(null).size();
		for (String blank : new String[] {null, "", "   ", "	"}) {
			assertThatThrownBy(() -> confirmWithCustomer(blank)).isInstanceOf(BusinessException.class)
					.isInstanceOfSatisfying(BusinessException.class, e -> {
						assertThat(e.isConflict()).isFalse();
						assertThat(e.getMessage()).isEqualTo("고객사를 입력하세요");
					});
		}
		assertThat(orderService.listOrders(null)).hasSize(count);
	}

	@Test
	void customerNameLengthBoundaryIncludesOneCharAndTrimmedHundred() {
		assertThat(orderService.getOrder(confirmWithCustomer("가").getId()).getCustomerName()).isEqualTo("가");
		assertThat(orderService.getOrder(confirmWithCustomer("  " + "가".repeat(100) + "  ").getId()).getCustomerName())
				.hasSize(100);
	}

	@Test
	void customerNameLengthBoundaryOnConfirm() {
		assertThat(orderService.getOrder(confirmWithCustomer("가".repeat(100)).getId()).getCustomerName())
				.hasSize(100);
		int count = orderService.listOrders(null).size();
		assertThatThrownBy(() -> confirmWithCustomer("가".repeat(101))).isInstanceOf(BusinessException.class)
				.hasMessage("고객사는 100자 이하로 입력하세요");
		assertThat(orderService.listOrders(null)).hasSize(count);
	}

	@Test
	void customerNameCanChangeWhileConfirmedOrInProgressWithoutTouchingThePlan() {
		Order order = confirmWithCustomer("처음");
		Long id = order.getId();
		String plan = order.getPlanJson();
		orderService.changeCustomerName(id, "A사", order.getVersion(), "tester");
		Order a = orderService.getOrder(id);
		assertThat(a.getCustomerName()).isEqualTo("A사");
		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, a.getVersion(), "tester");
		Order running = orderService.getOrder(id);
		orderService.changeCustomerName(id, "B사", running.getVersion(), "tester");
		Order b = orderService.getOrder(id);
		assertThat(b.getCustomerName()).isEqualTo("B사");
		assertThat(b.getPlanJson()).isEqualTo(plan);
		assertThat(b.getTotalCost()).isEqualTo(order.getTotalCost());
		assertThat(b.getRouteType()).isEqualTo(order.getRouteType());
		assertThat(b.getStatus()).isEqualTo(OrderStatus.IN_PROGRESS);
		assertThat(orderService.history(id)).hasSize(2);
	}

	@Test
	void customerNameCannotChangeAfterCompleted() {
		Order order = confirmWithCustomer("원래");
		Long id = order.getId();
		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, order.getVersion(), "u");
		orderService.changeStatus(id, OrderStatus.COMPLETED, orderService.getOrder(id).getVersion(), "u");
		Order done = orderService.getOrder(id);
		assertThatThrownBy(() -> orderService.changeCustomerName(id, "새", done.getVersion(), "u"))
				.isInstanceOf(BusinessException.class).hasMessage("완료 상태의 주문은 고객사를 수정할 수 없습니다");
		assertThat(orderService.getOrder(id).getCustomerName()).isEqualTo("원래");
	}

	@Test
	void customerNameCannotChangeAfterCanceled() {
		Order order = confirmWithCustomer("원래");
		Long id = order.getId();
		orderService.changeStatus(id, OrderStatus.CANCELED, order.getVersion(), "u");
		Order canceled = orderService.getOrder(id);
		assertThatThrownBy(() -> orderService.changeCustomerName(id, "새", canceled.getVersion(), "u"))
				.isInstanceOf(BusinessException.class).hasMessage("취소 상태의 주문은 고객사를 수정할 수 없습니다");
		assertThat(orderService.getOrder(id).getCustomerName()).isEqualTo("원래");
	}

	@Test
	void staleVersionOnCustomerChangeIsAConflict() {
		Order order = confirmWithCustomer("원래");
		Long id = order.getId();
		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, order.getVersion(), "u");
		assertThatThrownBy(() -> orderService.changeCustomerName(id, "새", order.getVersion(), "u"))
				.isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.isConflict()).isTrue());
		assertThat(orderService.getOrder(id).getCustomerName()).isEqualTo("원래");
	}

	@Test
	void customerNameLengthBoundaryAndBlankOnChange() {
		Order order = confirmWithCustomer("원래");
		Long id = order.getId();
		orderService.changeCustomerName(id, "가".repeat(100), order.getVersion(), "u");
		Order o = orderService.getOrder(id);
		assertThat(o.getCustomerName()).hasSize(100);
		assertThatThrownBy(() -> orderService.changeCustomerName(id, "가".repeat(101), o.getVersion(), "u"))
				.isInstanceOf(BusinessException.class).hasMessage("고객사는 100자 이하로 입력하세요");
		assertThat(orderService.getOrder(id).getCustomerName()).hasSize(100);
	}

	@Test
	void blankCustomerNameIsRejectedOnChange() {
		Order order = confirmWithCustomer("원래");
		Long id = order.getId();
		for (String blank : new String[] {"", "   ", null}) {
			assertThatThrownBy(() -> orderService.changeCustomerName(id, blank, order.getVersion(), "u"))
					.isInstanceOf(BusinessException.class).hasMessage("고객사를 입력하세요");
		}
		Order after = orderService.getOrder(id);
		assertThat(after.getCustomerName()).isEqualTo("원래");
		assertThat(after.getVersion()).isEqualTo(order.getVersion());
	}

	/** 필수화 이전에 확정된 주문(고객사 null)을 흉내 낸다 */
	private Order legacyOrderWithoutCustomer() {
		Order order = confirmWithCustomer("임시");
		Order saved = orderService.getOrder(order.getId());
		saved.changeCustomerName(null);
		return orderRepository.saveAndFlush(saved);
	}

	@Test
	void legacyOrderWithoutCustomerCanBeFilledOnceButNotCleared() {
		Order legacy = legacyOrderWithoutCustomer();
		Long id = legacy.getId();
		assertThat(legacy.getCustomerName()).isNull();
		assertThat(legacy.getStatus().isCustomerEditable()).isTrue();
		String plan = legacy.getPlanJson();
		int histories = orderService.history(id).size();

		orderService.changeCustomerName(id, "신규사", legacy.getVersion(), "u");
		Order filled = orderService.getOrder(id);
		assertThat(filled.getCustomerName()).isEqualTo("신규사");

		assertThatThrownBy(() -> orderService.changeCustomerName(id, "", filled.getVersion(), "u"))
				.isInstanceOf(BusinessException.class).hasMessage("고객사를 입력하세요");
		Order after = orderService.getOrder(id);
		assertThat(after.getCustomerName()).isEqualTo("신규사");
		assertThat(after.getPlanJson()).isEqualTo(plan);
		assertThat(after.getTotalCost()).isEqualTo(legacy.getTotalCost());
		assertThat(orderService.history(id)).hasSize(histories);
	}

	// ---------------------------------------------------------------- 상태 변경

	@Test
	void statusFollowsFixedOrderAndEveryChangeIsRecorded() {
		Order order = confirmDefault("COST", null);
		Long id = order.getId();
		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, order.getVersion(), "u1");
		Order running = orderService.getOrder(id);
		assertThat(running.getVersion()).isGreaterThan(order.getVersion());
		orderService.changeStatus(id, OrderStatus.COMPLETED, running.getVersion(), "u2");

		List<OrderStatusHistory> history = orderService.history(id);
		assertThat(history).extracting(OrderStatusHistory::getFromStatus)
				.containsExactly(null, OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS);
		assertThat(history).extracting(OrderStatusHistory::getToStatus)
				.containsExactly(OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED);
		assertThat(history).extracting(OrderStatusHistory::getChangedBy).containsExactly("tester", "u1", "u2");
	}

	@Test
	void notAllowedTransitionIsRejectedWithBothLabels() {
		Order order = confirmDefault("COST", null);
		assertThatThrownBy(() -> orderService.changeStatus(order.getId(), OrderStatus.COMPLETED, order.getVersion(), "u"))
				.isInstanceOfSatisfying(BusinessException.class, e -> {
					assertThat(e.getMessage()).isEqualTo("확정 상태에서는 완료(으)로 바꿀 수 없습니다");
					assertThat(e.isConflict()).isFalse();
				});
		assertThatThrownBy(() -> orderService.changeStatus(order.getId(), OrderStatus.CONFIRMED, order.getVersion(), "u"))
				.hasMessage("확정 상태에서는 확정(으)로 바꿀 수 없습니다");
		assertThat(orderService.getOrder(order.getId()).getStatus()).isEqualTo(OrderStatus.CONFIRMED);
		assertThat(orderService.history(order.getId())).hasSize(1);
	}

	@Test
	void staleVersionIsAConflictEvenWhenTransitionIsAllowed() {
		Order order = confirmDefault("COST", null);
		orderService.changeStatus(order.getId(), OrderStatus.IN_PROGRESS, order.getVersion(), "first");
		assertThatThrownBy(() -> orderService.changeStatus(order.getId(), OrderStatus.CANCELED, order.getVersion(), "second"))
				.isInstanceOfSatisfying(BusinessException.class, e -> {
					assertThat(e.isConflict()).isTrue();
					assertThat(e.getMessage()).isEqualTo(
							"다른 사용자가 먼저 이 주문을 변경했습니다. 화면을 새로 고쳐 현재 상태를 확인한 뒤 다시 시도해 주세요");
				});
		assertThat(orderService.getOrder(order.getId()).getStatus()).isEqualTo(OrderStatus.IN_PROGRESS);
	}

	@Test
	void versionIsCheckedBeforeTransition() {
		Order order = confirmDefault("COST", null);
		// 허용되지 않는 변경이면서 version 도 틀린 경우: 충돌이 먼저 보고된다
		assertThatThrownBy(() -> orderService.changeStatus(order.getId(), OrderStatus.COMPLETED, order.getVersion() + 99, "u"))
				.isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.isConflict()).isTrue());
	}

	@Test
	void cancelKeepsTheOrderWithCanceledStatusAndHistory() {
		Order order = confirmDefault("COST", null);
		Long id = order.getId();
		Map<OrderStatus, Long> before = orderService.countByStatus();
		orderService.changeStatus(id, OrderStatus.CANCELED, order.getVersion(), "canceller");

		Order canceled = orderService.getOrder(id);
		assertThat(canceled.getStatus()).isEqualTo(OrderStatus.CANCELED);
		assertThat(canceled.getStatus().next()).isEmpty();
		Map<OrderStatus, Long> after = orderService.countByStatus();
		assertThat(after.get(OrderStatus.CONFIRMED)).isEqualTo(before.get(OrderStatus.CONFIRMED) - 1);
		assertThat(after.get(OrderStatus.CANCELED)).isEqualTo(before.get(OrderStatus.CANCELED) + 1);
		assertThat(orderService.listOrders(OrderStatus.CANCELED)).extracting(Order::getId).contains(id);
		assertThat(orderService.listOrders(null)).extracting(Order::getId).contains(id);
		List<OrderStatusHistory> history = orderService.history(id);
		assertThat(history).hasSize(2);
		assertThat(history.get(1).getFromStatus()).isEqualTo(OrderStatus.CONFIRMED);
		assertThat(history.get(1).getToStatus()).isEqualTo(OrderStatus.CANCELED);
		assertThat(history.get(1).getChangedBy()).isEqualTo("canceller");
	}

	@Test
	void inProgressOrderCanBeCanceledToo() {
		Order order = confirmDefault("COST", null);
		orderService.changeStatus(order.getId(), OrderStatus.IN_PROGRESS, order.getVersion(), "u");
		long version = orderService.getOrder(order.getId()).getVersion();
		orderService.changeStatus(order.getId(), OrderStatus.CANCELED, version, "u");
		assertThat(orderService.getOrder(order.getId()).getStatus()).isEqualTo(OrderStatus.CANCELED);
		assertThat(orderService.history(order.getId())).hasSize(3);
	}

	@Test
	void canceledOrderIsFinalAndCannotBeChangedAgain() {
		Order order = confirmDefault("COST", null);
		orderService.changeStatus(order.getId(), OrderStatus.CANCELED, order.getVersion(), "u");
		long version = orderService.getOrder(order.getId()).getVersion();
		for (OrderStatus target : OrderStatus.values()) {
			assertThatThrownBy(() -> orderService.changeStatus(order.getId(), target, version, "u"))
					.isInstanceOf(BusinessException.class)
					.hasMessage("취소 상태에서는 %s(으)로 바꿀 수 없습니다".formatted(target.getLabel()));
		}
		assertThat(orderService.history(order.getId())).hasSize(2);
	}

	@Test
	void changingStatusOfUnknownOrderIsReported() {
		assertThatThrownBy(() -> orderService.changeStatus(-12345L, OrderStatus.IN_PROGRESS, 0, "u"))
				.isInstanceOf(NotFoundException.class).hasMessage("주문을 찾을 수 없습니다");
	}
}
