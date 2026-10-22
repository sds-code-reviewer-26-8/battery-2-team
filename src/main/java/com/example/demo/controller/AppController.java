package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.service.BatteryService;
import com.example.demo.service.BusinessException;
import jakarta.servlet.http.HttpSession;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.SessionAttribute;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class AppController {

	private final BatteryService service;
	private final String accountUsername;
	private final String accountPassword;

	/** 로그인 계정은 단일 계정이며, 설정(app.login.username / app.login.password)이 없으면 admin/admin 이다. */
	public AppController(BatteryService service, @Value("${app.login.username:admin}") String accountUsername,
			@Value("${app.login.password:admin}") String accountPassword) {
		this.service = service;
		this.accountUsername = accountUsername;
		this.accountPassword = accountPassword;
	}

	/** 모든 화면 상단에 로그인한 아이디를 보여 주기 위한 공통 모델 */
	@ModelAttribute("loginUser")
	public String loginUser(HttpSession session) {
		return (String) session.getAttribute(LoginInterceptor.SESSION_USER);
	}

	// ---------------------------------------------------------------- 로그인

	@GetMapping("/")
	public String home() {
		return "redirect:/orders";
	}

	@GetMapping("/login")
	public String loginForm(HttpSession session) {
		if (session.getAttribute(LoginInterceptor.SESSION_USER) != null) {
			return "redirect:/orders";
		}
		return "login";
	}

	@PostMapping("/login")
	public String login(@RequestParam String username, @RequestParam String password, HttpSession session,
			Model model) {
		if (accountUsername.equals(username) && accountPassword.equals(password)) {
			session.setAttribute(LoginInterceptor.SESSION_USER, username);
			return "redirect:/orders";
		}
		model.addAttribute("error", "아이디 또는 비밀번호가 올바르지 않습니다");
		return "login";
	}

	@PostMapping("/logout")
	public String logout(HttpSession session) {
		session.invalidate();
		return "redirect:/login";
	}

	// ---------------------------------------------------------------- 주문 화면

	@GetMapping("/orders")
	public String list(@RequestParam(required = false) OrderStatus status, Model model) {
		model.addAttribute("orders", service.listOrders(status));
		model.addAttribute("counts", service.countByStatus());
		model.addAttribute("status", status);
		model.addAttribute("statuses", OrderStatus.values());
		model.addAttribute("total", service.listOrders(null).size());
		return "orders";
	}

	@GetMapping("/orders/new")
	public String newOrder(Model model) {
		model.addAttribute("master", service.currentMaster());
		return "order-new";
	}

	@GetMapping("/orders/{id}")
	public String detail(@PathVariable Long id, Model model) {
		Order order = service.getOrder(id);
		model.addAttribute("order", order);
		model.addAttribute("history", service.history(id));
		return "order-detail";
	}

	@PostMapping("/orders/{id}/status")
	public String changeStatus(@PathVariable Long id, @RequestParam OrderStatus status, @RequestParam long version,
			@SessionAttribute(LoginInterceptor.SESSION_USER) String user, RedirectAttributes redirect) {
		try {
			service.changeStatus(id, status, version, user);
			redirect.addFlashAttribute("message", "상태를 '" + status.getLabel() + "'(으)로 바꿨습니다");
		} catch (BusinessException e) {
			redirect.addFlashAttribute("error", e.getMessage());
		}
		return "redirect:/orders/" + id;
	}

	// ---------------------------------------------------------------- 마스터 데이터 화면

	@GetMapping("/master")
	public String master(Model model) {
		if (!model.containsAttribute("form")) {
			model.addAttribute("form", service.masterForm());
		}
		addMasterChoices(model);
		return "master";
	}

	@PostMapping("/master")
	public String saveMaster(@RequestParam Map<String, String> form, Model model, RedirectAttributes redirect) {
		try {
			service.updateMaster(form);
		} catch (BusinessException e) {
			model.addAttribute("errors", e.getMessages());
			model.addAttribute("form", form);
			addMasterChoices(model);
			return "master";
		}
		redirect.addFlashAttribute("message", "마스터 데이터를 저장했습니다");
		return "redirect:/master";
	}

	/** 마스터 화면이 입력칸을 그릴 때 쓰는 나라 목록 */
	private static void addMasterChoices(Model model) {
		model.addAttribute("factories", Country.factories());
		model.addAttribute("countries", Country.values());
	}
}
