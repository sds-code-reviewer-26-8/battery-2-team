package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MasterService;
import com.example.demo.service.OrderService;
import com.example.demo.service.SimulationService;
import com.example.demo.simulation.Master;
import com.example.demo.simulation.Master.FactoryParam;
import com.example.demo.simulation.Master.RouteParam;
import com.example.demo.simulation.Plan;
import com.example.demo.simulation.Planner;
import com.example.demo.simulation.StoredPlan;
import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** 공장 운영비: 계산(Planner)·입력 검증(MasterService)·주문 저장(OrderService)·옛 주문 호환 */
@SpringBootTest
class OperatingCostTest {

	private static final long EOK = 100_000_000L;

	@Autowired
	MasterService masters;
	@Autowired
	SimulationService simulations;
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

	private static Master master(long chinaCost, long japanCost, long vietnamCost, long indonesiaCost) {
		return new Master(1, 3, EOK,
				List.of(new FactoryParam(Country.CHINA, 400, 4000, 700, chinaCost),
						new FactoryParam(Country.JAPAN, 800, 2000, 900, japanCost),
						new FactoryParam(Country.VIETNAM, 200, 10000, 550, vietnamCost),
						new FactoryParam(Country.INDONESIA, 300, 7000, 450, indonesiaCost)),
				List.of(new RouteParam(Country.KOREA, Country.CHINA, 1),
						new RouteParam(Country.KOREA, Country.JAPAN, 2),
						new RouteParam(Country.KOREA, Country.VIETNAM, 5),
						new RouteParam(Country.KOREA, Country.INDONESIA, 7),
						new RouteParam(Country.CHINA, Country.JAPAN, 2),
						new RouteParam(Country.CHINA, Country.VIETNAM, 4),
						new RouteParam(Country.CHINA, Country.INDONESIA, 6),
						new RouteParam(Country.JAPAN, Country.VIETNAM, 5),
						new RouteParam(Country.JAPAN, Country.INDONESIA, 7),
						new RouteParam(Country.VIETNAM, Country.INDONESIA, 2)));
	}

	private static Map<Country, Integer> orders(int china, int japan, int vietnam, int indonesia) {
		Map<Country, Integer> m = new EnumMap<>(Country.class);
		m.put(Country.CHINA, china);
		m.put(Country.JAPAN, japan);
		m.put(Country.VIETNAM, vietnam);
		m.put(Country.INDONESIA, indonesia);
		return m;
	}

	private static Plan byType(List<Plan> plans, String type) {
		return plans.stream().filter(p -> p.type().equals(type)).findFirst().orElseThrow();
	}

	// ---------------------------------------------------------------- TC-5 계산

	@Test
	void operatingCostIsChargedForOrderedFactoriesFromDayZeroToTotalDays() {
		Master m = master(10 * EOK, 10 * EOK, 10 * EOK, 10 * EOK);
		for (Plan p : Planner.plan(m, orders(3000, 3000, 0, 0))) {
			assertThat(p.operatingCost()).as(p.label()).isEqualTo(2 * 10 * EOK * p.totalDays());
			assertThat(p.totalCost()).as(p.label())
					.isEqualTo(p.productionCost() + p.shippingCost() + p.operatingCost());
		}
	}

	// ---------------------------------------------------------------- TC-6 0원

	@Test
	void zeroOperatingCostLeavesTotalAsProductionPlusShipping() {
		Master m = master(0, 0, 0, 0);
		for (Plan p : Planner.plan(m, orders(3000, 3000, 3000, 3000))) {
			assertThat(p.operatingCost()).isZero();
			assertThat(p.totalCost()).isEqualTo(p.productionCost() + p.shippingCost());
		}
		assertThat(Planner.plan(m, orders(3000, 3000, 3000, 3000)).get(0).label()).isEqualTo("총 비용 최소");
	}

	// ---------------------------------------------------------------- TC-7 COST 선택

	@Test
	void costOptionMinimizesTotalCostAndTiesGoToTheFasterRoute() {
		Master m = master(10 * EOK, 10 * EOK, 10 * EOK, 10 * EOK);
		List<Plan> plans = Planner.plan(m, orders(3000, 3000, 3000, 3000));
		Plan cost = byType(plans, Planner.COST);
		Plan fast = byType(plans, Planner.FAST);
		assertThat(cost.totalCost()).isLessThanOrEqualTo(fast.totalCost());
		assertThat(fast.totalDays()).isLessThanOrEqualTo(cost.totalDays());
	}

	@Test
	void hugeOperatingCostMakesCostOptionAsFastAsFastOption() {
		Master m = master(1000 * EOK, 1000 * EOK, 1000 * EOK, 1000 * EOK);
		List<Plan> plans = Planner.plan(m, orders(3000, 3000, 3000, 3000));
		assertThat(byType(plans, Planner.COST).totalDays()).isEqualTo(byType(plans, Planner.FAST).totalDays());
	}

	// ---------------------------------------------------------------- TC-8 공장별 차등

	@Test
	void operatingCostDiffersPerFactory() {
		Master m = master(1 * EOK, 2 * EOK, 30 * EOK, 40 * EOK);
		for (Plan p : Planner.plan(m, orders(1000, 0, 2000, 0))) {
			assertThat(p.operatingCost()).as(p.label()).isEqualTo((1 + 30) * EOK * p.totalDays());
		}
	}

	// ---------------------------------------------------------------- TC-9 입력 검증

	private void assertRejected(String key, String value, String expectedMessagePart) {
		long before = masters.currentMaster().version();
		Map<String, String> form = new HashMap<>(originalForm);
		form.put(key, value);
		try {
			masters.updateMaster(form);
			org.junit.jupiter.api.Assertions.fail(key + "=" + value + " 은 거부되어야 합니다");
		} catch (BusinessException e) {
			assertThat(e.getMessages()).anyMatch(msg -> msg.contains(expectedMessagePart));
		}
		assertThat(masters.currentMaster().version()).isEqualTo(before);
	}

	@Test
	void invalidOperatingCostsAreRejectedWithReasonAndNothingIsSaved() {
		assertRejected("operatingCost_CHINA", "abc", "중국 하루 운영비(억 원)은(는) 숫자로 입력하세요");
		assertRejected("operatingCost_JAPAN", "", "일본 하루 운영비(억 원)은(는) 숫자로 입력하세요");
		assertRejected("operatingCost_VIETNAM", "-1", "베트남 하루 운영비(억 원)은(는) 0 이상 1000 이하여야 합니다");
		assertRejected("operatingCost_INDONESIA", "1001", "인도네시아 하루 운영비(억 원)은(는) 0 이상 1000 이하여야 합니다");
		assertRejected("operatingCost_CHINA", "0.000000001", "중국 하루 운영비은(는) 원 단위로 떨어지는 값이어야 합니다");
	}

	@Test
	void defaultOperatingCostIsHalfEokPerFactoryAndSavingBumpsVersion() {
		for (Country c : Country.factories()) {
			assertThat(originalForm.get("operatingCost_" + c)).isEqualTo("0.5");
		}
		long before = masters.currentMaster().version();
		Map<String, String> form = new HashMap<>(originalForm);
		form.put("operatingCost_JAPAN", "0.7");
		form.put("operatingCost_CHINA", "0");
		masters.updateMaster(form);
		Master after = masters.currentMaster();
		assertThat(after.version()).isEqualTo(before + 1);
		assertThat(after.factory(Country.JAPAN).operatingCostWon()).isEqualTo(70_000_000L);
		assertThat(after.factory(Country.CHINA).operatingCostWon()).isZero();
		assertThat(after.factory(Country.VIETNAM).operatingCostWon()).isEqualTo(EOK / 2);
	}

	/** 하루 운영비 칸이 없던 시절 형식의 저장 요청은 거부하지 않고, 운영비는 지금 저장된 값을 그대로 둔다. */
	@Test
	void saveWithoutOperatingCostFieldsKeepsTheStoredValues() {
		Map<String, String> form = new HashMap<>(originalForm);
		form.put("operatingCost_CHINA", "3");
		masters.updateMaster(form);
		for (Country c : Country.factories()) {
			form.remove("operatingCost_" + c);
		}
		form.put("shipCount", "2");
		masters.updateMaster(form);
		Master after = masters.currentMaster();
		assertThat(after.shipCount()).isEqualTo(2);
		assertThat(after.factory(Country.CHINA).operatingCostWon()).isEqualTo(3 * EOK);
		assertThat(after.factory(Country.JAPAN).operatingCostWon()).isEqualTo(EOK / 2);
	}

	/** 칸은 있는데 비어 있으면 값을 안 넣은 것이 아니라 잘못된 입력이다. */
	@Test
	void blankOperatingCostFieldIsStillRejected() {
		assertRejected("operatingCost_CHINA", "", "중국 하루 운영비(억 원)은(는) 숫자로 입력하세요");
	}

	// ---------------------------------------------------------------- 확정 저장

	@Test
	void confirmStoresServerCalculatedOperatingCost() {
		Master master = masters.currentMaster();
		Map<Country, Integer> req = orders(3000, 3000, 3000, 3000);
		Plan expected = byType(simulations.simulate(req).options(), Planner.COST);
		Order order = orderService.confirm(req, Planner.COST, master.version(), null, "admin");
		assertThat(order.getOperatingCost()).isEqualTo(expected.operatingCost()).isPositive();
		assertThat(order.getTotalCost()).isEqualTo(
				order.getProductionCost() + order.getShippingCost() + order.getOperatingCost());
		assertThat(orderService.storedPlan(order).plan().operatingCost()).isEqualTo(order.getOperatingCost());
	}

	// ---------------------------------------------------------------- TC-10 옛 주문 호환

	@Test
	void oldOrderWithoutOperatingCostIsShownAsZeroAndTotalIsNotRecalculated() {
		Order old = new Order(LocalDateTime.now(), "admin", 12000, "COST", "운항비 최소", 10, 100 * EOK, 20 * EOK,
				120 * EOK, null, "{}");
		assertThat(old.getOperatingCost()).isZero();
		assertThat(old.getOperatingCostEok()).isEqualTo("0.00");
		assertThat(old.getTotalCost()).isEqualTo(120 * EOK);
	}

	@Test
	void oldStoredPlanJsonWithoutOperatingCostIsReadAsZero() throws Exception {
		String oldJson = """
				{"master":{"version":1,"shipCount":1,"shipDailyCostWon":100000000,
				"factories":[{"country":"CHINA","maxDaily":400,"stockLimit":4000,"unitCost":700}],
				"routes":[{"from":"KOREA","to":"CHINA","days":1}]},
				"orders":{"CHINA":400},"visits":{"CHINA":1},
				"plan":{"type":"COST","label":"운항비 최소","totalDays":2,"productionCost":280000000,
				"shippingCost":200000000,"totalCost":480000000,"ships":[],"stock":{},"production":{}}}
				""";
		StoredPlan stored = json.readValue(oldJson, StoredPlan.class);
		assertThat(stored.master().factory(Country.CHINA).operatingCostWon()).isZero();
		assertThat(stored.plan().operatingCost()).isZero();
		assertThat(stored.plan().totalCost()).isEqualTo(480_000_000L);
	}
}
