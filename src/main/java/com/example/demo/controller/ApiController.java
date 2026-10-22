package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MasterService;
import com.example.demo.service.OrderService;
import com.example.demo.service.SimulationService;
import com.example.demo.service.SimulationService.SimulationResult;
import com.example.demo.simulation.Master;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.SessionAttribute;

/** 화면 스크립트가 부르는 JSON API. 업무 오류는 한 곳({@link #businessError})에서 응답으로 바꾼다. */
@RestController
@RequestMapping("/api")
public class ApiController {

	public record SimulateRequest(Map<Country, Integer> orders) {
	}

	public record ConfirmRequest(Map<Country, Integer> orders, String routeType, long masterVersion, String memo) {
	}

	private final MasterService masters;
	private final SimulationService simulations;
	private final OrderService orders;

	public ApiController(MasterService masters, SimulationService simulations, OrderService orders) {
		this.masters = masters;
		this.simulations = simulations;
		this.orders = orders;
	}

	@GetMapping("/master")
	public Master master() {
		return masters.currentMaster();
	}

	@PostMapping("/simulate")
	public SimulationResult simulate(@RequestBody SimulateRequest request) {
		return simulations.simulate(request.orders());
	}

	@PostMapping("/orders")
	public Map<String, Long> confirm(@RequestBody ConfirmRequest request,
			@SessionAttribute(LoginInterceptor.SESSION_USER) String user) {
		Order order = orders.confirm(request.orders(), request.routeType(), request.masterVersion(), request.memo(),
				user);
		return Map.of("id", order.getId());
	}

	/** 충돌(마스터 변경·동시 변경)은 409, 그 외 입력 오류는 400 */
	@ExceptionHandler(BusinessException.class)
	public ResponseEntity<Map<String, Object>> businessError(BusinessException e) {
		HttpStatus status = e.isConflict() ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
		return ResponseEntity.status(status).body(Map.of("error", e.getMessage(), "conflict", e.isConflict()));
	}
}
