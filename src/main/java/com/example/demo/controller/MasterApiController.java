package com.example.demo.controller;

import com.example.demo.service.MasterService;
import com.example.demo.simulation.Master;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 마스터 데이터(공장·항로·선박 설정) 조회와 저장 */
@RestController
@RequestMapping("/api/master")
public class MasterApiController {

	private final MasterService masters;

	public MasterApiController(MasterService masters) {
		this.masters = masters;
	}

	/** 계산에 쓰는 마스터 값 스냅샷(버전 포함) */
	@GetMapping
	public Master master() {
		return masters.currentMaster();
	}

	/** 마스터 화면의 입력칸 이름 → 현재 값 */
	@GetMapping("/form")
	public Map<String, String> form() {
		return masters.masterForm();
	}

	/** 입력칸 이름 → 값을 받아 검증하고 저장한다. 하나라도 틀리면 아무것도 저장하지 않는다. */
	@PostMapping
	public Map<String, String> save(@RequestBody Map<String, String> form) {
		masters.updateMaster(form);
		return Map.of("message", "마스터 데이터를 저장했습니다");
	}
}
