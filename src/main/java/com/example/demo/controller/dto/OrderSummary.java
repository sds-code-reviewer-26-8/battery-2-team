package com.example.demo.controller.dto;

import com.example.demo.entity.Order;
import java.time.format.DateTimeFormatter;

/** 주문 목록의 한 줄. 일시와 억 원 금액은 화면에 보이는 글자로 만들어 보낸다. */
public record OrderSummary(Long id, String confirmedAt, int totalK, String routeLabel, int totalDays,
		String operatingCostEok, String totalCostEok, StatusInfo status, String createdBy) {

	private static final DateTimeFormatter MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

	public static OrderSummary of(Order o) {
		return new OrderSummary(o.getId(), o.getConfirmedAt().format(MINUTE), o.getTotalK(), o.getRouteLabel(),
				o.getTotalDays(), o.getOperatingCostEok(), o.getTotalCostEok(), StatusInfo.of(o.getStatus()),
				o.getCreatedBy());
	}
}
