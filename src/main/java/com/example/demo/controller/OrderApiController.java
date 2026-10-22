package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.controller.dto.OrderDetail;
import com.example.demo.controller.dto.OrderList;
import com.example.demo.controller.dto.OrderSummary;
import com.example.demo.controller.dto.StatusInfo;
import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.service.OrderService;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.SessionAttribute;

/** 주문 목록·상세 조회, 확정, 상태 변경 */
@RestController
@RequestMapping("/api/orders")
public class OrderApiController {

	public record ConfirmRequest(Map<Country, Integer> orders, String routeType, long masterVersion, String memo) {
	}

	public record StatusRequest(OrderStatus status, long version) {
	}

	private final OrderService orders;

	public OrderApiController(OrderService orders) {
		this.orders = orders;
	}

	/** status 를 주면 그 상태의 주문만 돌려준다. 개수(counts, total)는 항상 전체 기준이다. */
	@GetMapping
	public OrderList list(@RequestParam(required = false) OrderStatus status) {
		Map<OrderStatus, Long> counts = orders.countByStatus();
		Map<String, Long> countsByName = new LinkedHashMap<>();
		counts.forEach((s, n) -> countsByName.put(s.name(), n));
		// 상태별 개수의 합이 전체 주문 수이다 (별도 전체 조회가 필요 없다)
		long total = counts.values().stream().mapToLong(Long::longValue).sum();
		return new OrderList(orders.listOrders(status).stream().map(OrderSummary::of).toList(), countsByName, total,
				Arrays.stream(OrderStatus.values()).map(StatusInfo::of).toList());
	}

	@GetMapping("/{id}")
	public OrderDetail detail(@PathVariable Long id) {
		Order order = orders.getOrder(id);
		return OrderDetail.of(order, orders.history(id), orders.storedPlan(order));
	}

	@PostMapping
	public Map<String, Long> confirm(@RequestBody ConfirmRequest request,
			@SessionAttribute(LoginInterceptor.SESSION_USER) String user) {
		Order order = orders.confirm(request.orders(), request.routeType(), request.masterVersion(), request.memo(),
				user);
		return Map.of("id", order.getId());
	}

	@PostMapping("/{id}/status")
	public Map<String, String> changeStatus(@PathVariable Long id, @RequestBody StatusRequest request,
			@SessionAttribute(LoginInterceptor.SESSION_USER) String user) {
		orders.changeStatus(id, request.status(), request.version(), user);
		return Map.of("message", "상태를 '" + request.status().getLabel() + "'(으)로 바꿨습니다");
	}
}
