package com.example.demo.controller.dto;

import com.example.demo.entity.OrderStatus;

/** 화면에 보여 줄 상태: 코드(name)와 한글 이름(label) */
public record StatusInfo(String name, String label) {

	public static StatusInfo of(OrderStatus status) {
		return new StatusInfo(status.name(), status.getLabel());
	}
}
