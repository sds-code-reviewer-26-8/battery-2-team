package com.example.demo.service;

import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.entity.OrderStatusHistory;
import com.example.demo.repository.OrderRepository;
import com.example.demo.repository.OrderStatusHistoryRepository;
import com.example.demo.service.SimulationService.SimulationResult;
import com.example.demo.simulation.Plan;
import com.example.demo.simulation.StoredPlan;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** 주문 확정, 조회, 상태 변경. 상태가 바뀔 때마다 이력을 남긴다. */
@Service
public class OrderService {

	private static final int MAX_MEMO = 1000;

	/** 필요 납기일은 오늘(주문일=0일차)부터 이 범위의 일수로만 고를 수 있다(경계 포함) */
	public static final int MIN_DUE_DAYS = 5;
	public static final int MAX_DUE_DAYS = 50;

	/**
	 * 납기 규칙. 화면이 같은 범위, 같은 '오늘'로 날짜 선택 범위를 정하도록 서버가 알려 준다.
	 * 브라우저와 서버의 시계·시간대가 달라도(자정 무렵) 화면이 허용한 날짜를 서버가 거절하지 않게 하려는 것이다.
	 */
	public record DueRules(int minDays, int maxDays, String today) {
	}

	private final SimulationService simulations;
	private final OrderRepository orders;
	private final OrderStatusHistoryRepository histories;
	private final ObjectMapper json;

	public OrderService(SimulationService simulations, OrderRepository orders, OrderStatusHistoryRepository histories,
			ObjectMapper json) {
		this.simulations = simulations;
		this.orders = orders;
		this.histories = histories;
		this.json = json;
	}

	/**
	 * 주문을 확정한다. 서버가 같은 입력으로 다시 계산해 계획을 만들고(클라이언트 값은 믿지 않는다),
	 * 시뮬레이션 이후 마스터 데이터가 바뀌었으면 확정을 거부한다.
	 */
	@Transactional
	public Order confirm(Map<Country, Integer> requested, String routeType, long masterVersion, String memo,
			String user) {
		return confirm(requested, routeType, masterVersion, memo, null, null, user);
	}

	/**
	 * 필요 납기와 함께 확정한다. dueAsap 과 dueDate 가 모두 없으면 납기 기능 전 형식의 요청으로 보고 납기를 저장하지 않는다.
	 * 납기 초과 여부는 화면 값을 받지 않고 서버가 다시 계산한 소요일로 정한다. 초과해도 확정은 막지 않는다.
	 */
	@Transactional
	public Order confirm(Map<Country, Integer> requested, String routeType, long masterVersion, String memo,
			Boolean asap, String dueDate, String user) {
		SimulationResult result = simulations.simulate(requested);
		if (result.master().version() != masterVersion) {
			throw new BusinessException("시뮬레이션 이후 마스터 데이터가 바뀌었습니다. 다시 시뮬레이션해 주세요", true);
		}
		Plan plan = result.options().stream().filter(p -> p.type().equals(routeType)).findFirst()
				.orElseThrow(() -> new BusinessException("선택한 경로를 찾을 수 없습니다"));
		String note = memo == null ? null : memo.strip();
		if (note != null && note.length() > MAX_MEMO) {
			throw new BusinessException("메모는 %d자 이하로 입력하세요".formatted(MAX_MEMO));
		}
		if (note != null && note.isEmpty()) {
			note = null;
		}

		Due due = due(asap, dueDate, plan.totalDays());

		StoredPlan stored = new StoredPlan(result.master(), result.orders(), result.visits(), plan);
		int totalK = result.orders().values().stream().mapToInt(Integer::intValue).sum();
		LocalDateTime now = LocalDateTime.now();
		Order created = new Order(now, user, totalK, plan.type(), plan.label(), plan.totalDays(),
				plan.productionCost(), plan.shippingCost(), plan.totalCost(), note, json.writeValueAsString(stored),
				due.asap(), due.date(), due.exceeded());
		Order order = orders.save(created);
		histories.save(new OrderStatusHistory(order.getId(), null, OrderStatus.CONFIRMED, user, now));
		return order;
	}

	public DueRules dueRules() {
		return new DueRules(MIN_DUE_DAYS, MAX_DUE_DAYS, today().toString());
	}

	/** 오늘. 납기 검증과 화면에 알려 주는 규칙이 같은 값을 쓰도록 한 곳에서 정한다. */
	private static LocalDate today() {
		return LocalDate.now();
	}

	private record Due(Boolean asap, LocalDate date, Boolean exceeded) {
	}

	/** 필요 납기 검증. 오늘은 서버 시스템 기본 시간대의 날짜이다(확정 일시와 같은 기준). */
	private static Due due(Boolean asap, String dueDate, int totalDays) {
		String text = dueDate == null ? "" : dueDate.strip();
		if (Boolean.TRUE.equals(asap)) {
			return new Due(true, null, null);
		}
		if (asap == null && text.isEmpty()) {
			return new Due(null, null, null); // 납기 기능 전 형식의 요청(하위 호환)
		}
		if (text.isEmpty()) {
			throw new BusinessException("필요 납기일을 선택하거나 '가능한 빨리'를 체크하세요");
		}
		LocalDate date;
		try {
			date = LocalDate.parse(text);
		} catch (DateTimeParseException e) {
			throw new BusinessException("필요 납기일 형식이 올바르지 않습니다(yyyy-MM-dd)");
		}
		long days = ChronoUnit.DAYS.between(today(), date);
		if (days < MIN_DUE_DAYS || days > MAX_DUE_DAYS) {
			throw new BusinessException(
					"필요 납기일은 오늘부터 %d~%d일 사이로 선택하세요".formatted(MIN_DUE_DAYS, MAX_DUE_DAYS));
		}
		return new Due(false, date, totalDays > days);
	}

	@Transactional(readOnly = true)
	public List<Order> listOrders(OrderStatus status) {
		return status == null ? orders.findAllByOrderByIdDesc() : orders.findByStatusOrderByIdDesc(status);
	}

	@Transactional(readOnly = true)
	public Map<OrderStatus, Long> countByStatus() {
		Map<OrderStatus, Long> counts = new EnumMap<>(OrderStatus.class);
		for (OrderStatus s : OrderStatus.values()) {
			counts.put(s, 0L);
		}
		orders.countGroupedByStatus().forEach(row -> counts.put(row.getStatus(), row.getTotal()));
		return counts;
	}

	@Transactional(readOnly = true)
	public Order getOrder(Long id) {
		return orders.findById(id).orElseThrow(() -> new NotFoundException("주문을 찾을 수 없습니다"));
	}

	/** 확정 때 저장해 둔 계획(주문 당시의 마스터 값 포함) */
	public StoredPlan storedPlan(Order order) {
		return json.readValue(order.getPlanJson(), StoredPlan.class);
	}

	@Transactional(readOnly = true)
	public List<OrderStatusHistory> history(Long orderId) {
		return histories.findByOrderIdOrderByIdAsc(orderId);
	}

	/**
	 * 상태를 바꾼다. 화면에서 본 시점의 version 과 다르면(= 그 사이 다른 사람이 바꿈) 거부한다.
	 * 취소(CANCELED)해도 주문은 지우지 않고 '취소' 상태의 최종 상태로 남긴다.
	 */
	@Transactional
	public void changeStatus(Long id, OrderStatus target, long expectedVersion, String user) {
		Order order = getOrder(id);
		if (order.getVersion() != expectedVersion) {
			throw conflict();
		}
		if (!order.getStatus().canChangeTo(target)) {
			throw new BusinessException("%s 상태에서는 %s(으)로 바꿀 수 없습니다"
					.formatted(order.getStatus().getLabel(), target.getLabel()));
		}
		OrderStatus from = order.getStatus();
		order.setStatus(target);
		try {
			orders.saveAndFlush(order);
		} catch (ObjectOptimisticLockingFailureException e) {
			throw conflict();
		}
		histories.save(new OrderStatusHistory(id, from, target, user, LocalDateTime.now()));
	}

	private static BusinessException conflict() {
		return new BusinessException("다른 사용자가 먼저 이 주문을 변경했습니다. 화면을 새로 고쳐 현재 상태를 확인한 뒤 다시 시도해 주세요", true);
	}
}
