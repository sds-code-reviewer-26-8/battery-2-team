package com.example.demo.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.example.demo.entity.Country;
import com.example.demo.simulation.Master.FactoryParam;
import com.example.demo.simulation.Master.RouteParam;
import com.example.demo.simulation.Plan.ShipPlan;
import com.example.demo.simulation.Plan.Trip;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * 리팩토링 전후 계산 결과가 같은지 확인하는 특성(characterization) 테스트.
 *
 * <p>여러 입력에 대한 {@link Planner} 결과(경로 3종의 일수·비용·왕복·방문 순서·일별 재고와 생산)를 글자로 풀어
 * {@code src/test/resources/golden/planner.txt} 와 비교한다. 파일은 리팩토링 전의 코드로 만든 값이며,
 * 계산 규칙을 일부러 바꿀 때만 {@code 환경변수 GOLDEN_UPDATE=true} 로 다시 만든다(바뀐 내용은 git diff 로 확인한다).
 */
class PlannerGoldenTest {

	private static final String GOLDEN = "golden/planner.txt";
	private static final Path GOLDEN_SOURCE = Path.of("src/test/resources", GOLDEN);

	private static Master defaultMaster(int ships) {
		return new Master(1, ships, 100_000_000L,
				List.of(new FactoryParam(Country.CHINA, 400, 4000, 700),
						new FactoryParam(Country.JAPAN, 800, 2000, 900),
						new FactoryParam(Country.VIETNAM, 200, 10000, 550),
						new FactoryParam(Country.INDONESIA, 300, 7000, 450)),
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

	/** 기본값과 모든 값이 다른 마스터: 비용·생산량·재고 상한·항해 일수가 계산에 모두 쓰이는지 본다. */
	private static Master otherMaster(int ships) {
		return new Master(7, ships, 150_000_000L,
				List.of(new FactoryParam(Country.CHINA, 250, 1500, 800),
						new FactoryParam(Country.JAPAN, 500, 3000, 1000),
						new FactoryParam(Country.VIETNAM, 350, 2500, 600),
						new FactoryParam(Country.INDONESIA, 150, 900, 500)),
				List.of(new RouteParam(Country.KOREA, Country.CHINA, 3),
						new RouteParam(Country.KOREA, Country.JAPAN, 1),
						new RouteParam(Country.KOREA, Country.VIETNAM, 6),
						new RouteParam(Country.KOREA, Country.INDONESIA, 4),
						new RouteParam(Country.CHINA, Country.JAPAN, 2),
						new RouteParam(Country.CHINA, Country.VIETNAM, 3),
						new RouteParam(Country.CHINA, Country.INDONESIA, 5),
						new RouteParam(Country.JAPAN, Country.VIETNAM, 4),
						new RouteParam(Country.JAPAN, Country.INDONESIA, 6),
						new RouteParam(Country.VIETNAM, Country.INDONESIA, 1)));
	}

	private static Map<Country, Integer> orders(int china, int japan, int vietnam, int indonesia) {
		Map<Country, Integer> m = new EnumMap<>(Country.class);
		m.put(Country.CHINA, china);
		m.put(Country.JAPAN, japan);
		m.put(Country.VIETNAM, vietnam);
		m.put(Country.INDONESIA, indonesia);
		return m;
	}

	/** 시나리오 이름 → 결과. 이름 순서가 곧 파일의 순서이다. */
	private static Map<String, String> scenarios() {
		Map<String, String> s = new LinkedHashMap<>();
		// 기본 화면의 주문(12,000K 를 네 나라에 고르게), 배 척수를 바꿔 가며
		for (int ships = 1; ships <= 4; ships++) {
			s.put("기본 마스터, 배 " + ships + "척, 3000/3000/3000/3000", run(defaultMaster(ships), orders(3000, 3000, 3000, 3000)));
		}
		// 한 나라만 주문
		s.put("중국만 400", run(defaultMaster(3), orders(400, 0, 0, 0)));
		s.put("베트남만 2000", run(defaultMaster(1), orders(0, 0, 2000, 0)));
		s.put("일본만 4500 (3번 방문)", run(defaultMaster(1), orders(0, 4500, 0, 0)));
		s.put("인도네시아만 14000 (2번 방문)", run(defaultMaster(3), orders(0, 0, 0, 14000)));
		// 아주 작은 주문
		s.put("1/1/1/1", run(defaultMaster(3), orders(1, 1, 1, 1)));
		// 방문 횟수가 나라마다 다른 주문(왕복 패턴 후보가 늘어난다)
		s.put("4001/2000/0/14000", run(defaultMaster(3), orders(4001, 2000, 0, 14000)));
		s.put("5000/1000/4500/1500, 배 4척", run(defaultMaster(4), orders(5000, 1000, 4500, 1500)));
		s.put("5000/5000/5000/5000, 배 4척", run(defaultMaster(4), orders(5000, 5000, 5000, 5000)));
		s.put("재고 상한 딱 맞음 4000/2000/10000/7000", run(defaultMaster(3), orders(4000, 2000, 10000, 7000)));
		// 다른 마스터 값
		s.put("다른 마스터, 배 2척, 3000/3000/3000/3000", run(otherMaster(2), orders(3000, 3000, 3000, 3000)));
		s.put("다른 마스터, 배 3척, 4000/0/2600/1000", run(otherMaster(3), orders(4000, 0, 2600, 1000)));
		s.put("다른 마스터, 배 4척, 100/7000/300/2000", run(otherMaster(4), orders(100, 7000, 300, 2000)));
		return s;
	}

	private static String run(Master master, Map<Country, Integer> orders) {
		StringBuilder sb = new StringBuilder();
		sb.append("visits=").append(Planner.visits(master, orders)).append('\n');
		for (Plan plan : Planner.plan(master, orders)) {
			sb.append(describe(plan));
		}
		return sb.toString();
	}

	private static String describe(Plan plan) {
		StringBuilder sb = new StringBuilder();
		sb.append("[%s %s] 일수=%d 생산비=%d 운항비=%d 합계=%d%n".formatted(plan.type(), plan.label(), plan.totalDays(),
				plan.productionCost(), plan.shippingCost(), plan.totalCost()));
		for (ShipPlan ship : plan.ships()) {
			sb.append("  배%d 항해일=%d%n".formatted(ship.no(), ship.sailDays()));
			for (Trip trip : ship.trips()) {
				String stops = trip.stops().stream()
						.map(st -> "%s(도착%d,출발%d,싣기%d)".formatted(st.country(), st.arriveDay(), st.leaveDay(), st.loadK()))
						.collect(Collectors.joining(" → "));
				sb.append("    출항%d 귀환%d: %s%n".formatted(trip.departDay(), trip.returnDay(), stops));
			}
		}
		for (Country c : Country.factories()) {
			sb.append("  재고 %s %s%n".formatted(c, Arrays.toString(plan.stock().get(c))));
			sb.append("  생산 %s %s%n".formatted(c, Arrays.toString(plan.production().get(c))));
		}
		return sb.toString();
	}

	private static String render() {
		StringBuilder sb = new StringBuilder();
		scenarios().forEach((name, result) -> sb.append("=== ").append(name).append('\n').append(result));
		return sb.toString();
	}

	@Test
	void resultsMatchTheRecordedGolden() throws IOException {
		String actual = render();
		if ("true".equals(System.getenv("GOLDEN_UPDATE"))) {
			// 기준 파일을 다시 만드는 모드에서는 비교가 의미 없으므로 통과시키지 않는다(CI 에서는 실패, 로컬에서는 건너뜀)
			assertThat(System.getenv("CI")).as("CI 에서는 GOLDEN_UPDATE 를 쓸 수 없습니다").isNull();
			Files.createDirectories(GOLDEN_SOURCE.getParent());
			Files.writeString(GOLDEN_SOURCE, actual, StandardCharsets.UTF_8);
			assumeTrue(false, "기준 파일을 다시 만들었습니다. git diff 로 바뀐 내용을 확인하세요");
		}
		try (InputStream in = getClass().getClassLoader().getResourceAsStream(GOLDEN)) {
			assertThat(in).as("기준 파일 %s 이 없습니다. 환경변수 GOLDEN_UPDATE=true 로 한 번 만드세요", GOLDEN).isNotNull();
			String expected = new String(in.readAllBytes(), StandardCharsets.UTF_8);
			assertThat(actual.replace("\r\n", "\n")).isEqualTo(expected.replace("\r\n", "\n"));
		}
	}

	/** 같은 입력은 몇 번을 돌려도 같은 결과여야 한다(순서가 해시나 실행 순서에 따라 바뀌지 않음). */
	@Test
	void resultIsDeterministic() {
		assertThat(render()).isEqualTo(render());
	}
}
