package com.example.demo.controller;

import com.example.demo.entity.Country;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MasterService;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 마스터 데이터 화면 */
@Controller
public class MasterPageController {

	private final MasterService masters;

	public MasterPageController(MasterService masters) {
		this.masters = masters;
	}

	@GetMapping("/master")
	public String master(Model model) {
		if (!model.containsAttribute("form")) {
			model.addAttribute("form", masters.masterForm());
		}
		addMasterChoices(model);
		return "master";
	}

	@PostMapping("/master")
	public String saveMaster(@RequestParam Map<String, String> form, Model model, RedirectAttributes redirect) {
		try {
			masters.updateMaster(form);
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
