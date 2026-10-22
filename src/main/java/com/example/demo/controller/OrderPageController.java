package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MasterService;
import com.example.demo.service.OrderService;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.SessionAttribute;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 주문 목록·추가·상세 화면 */
@Controller
public class OrderPageController {

	private final OrderService orders;
	private final MasterService masters;

	public OrderPageController(OrderService orders, MasterService masters) {
		this.orders = orders;
		this.masters = masters;
	}

	@GetMapping("/")
	public String home() {
		return "redirect:/orders";
	}

	@GetMapping("/orders")
	public String list(@RequestParam(required = false) OrderStatus status, Model model) {
		Map<OrderStatus, Long> counts = orders.countByStatus();
		model.addAttribute("orders", orders.listOrders(status));
		model.addAttribute("counts", counts);
		model.addAttribute("status", status);
		model.addAttribute("statuses", OrderStatus.values());
		// 취소된 주문은 삭제되므로 상태별 개수의 합이 전체 주문 수이다
		model.addAttribute("total", (int) counts.values().stream().mapToLong(Long::longValue).sum());
		return "orders";
	}

	@GetMapping("/orders/new")
	public String newOrder(Model model) {
		model.addAttribute("master", masters.currentMaster());
		return "order-new";
	}

	@GetMapping("/orders/{id}")
	public String detail(@PathVariable Long id, Model model) {
		Order order = orders.getOrder(id);
		model.addAttribute("order", order);
		model.addAttribute("history", orders.history(id));
		return "order-detail";
	}

	@PostMapping("/orders/{id}/status")
	public String changeStatus(@PathVariable Long id, @RequestParam OrderStatus status, @RequestParam long version,
			@SessionAttribute(LoginInterceptor.SESSION_USER) String user, RedirectAttributes redirect) {
		try {
			orders.changeStatus(id, status, version, user);
			redirect.addFlashAttribute("message", "상태를 '" + status.getLabel() + "'(으)로 바꿨습니다");
		} catch (BusinessException e) {
			redirect.addFlashAttribute("error", e.getMessage());
		}
		return "redirect:/orders/" + id;
	}
}
