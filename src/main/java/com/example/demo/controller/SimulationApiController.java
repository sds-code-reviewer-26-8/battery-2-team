package com.example.demo.controller;

import com.example.demo.entity.Country;
import com.example.demo.service.SimulationService;
import com.example.demo.service.SimulationService.SimulationResult;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 주문 수량으로 경로 3종을 계산한다. */
@RestController
@RequestMapping("/api/simulate")
public class SimulationApiController {

	public record SimulateRequest(Map<Country, Integer> orders) {
	}

	private final SimulationService simulations;

	public SimulationApiController(SimulationService simulations) {
		this.simulations = simulations;
	}

	@PostMapping
	public SimulationResult simulate(@RequestBody SimulateRequest request) {
		return simulations.simulate(request.orders());
	}
}
