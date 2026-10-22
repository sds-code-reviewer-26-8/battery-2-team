package com.example.demo.controller.dto;

import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatusHistory;
import com.example.demo.simulation.StoredPlan;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** 주문 상세 화면에 필요한 모든 값. version 은 상태를 바꿀 때 함께 보내야 하고, plan 은 확정 때 저장한 계획이다. */
public record OrderDetail(Long id, String confirmedAt, String createdBy, String routeLabel, String memo,
		StatusInfo status, long version, List<StatusInfo> nextStatuses, List<HistoryEntry> history, StoredPlan plan) {

	private static final DateTimeFormatter MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

	public static OrderDetail of(Order o, List<OrderStatusHistory> history, StoredPlan plan) {
		return new OrderDetail(o.getId(), o.getConfirmedAt().format(MINUTE), o.getCreatedBy(), o.getRouteLabel(),
				o.getMemo(), StatusInfo.of(o.getStatus()), o.getVersion(),
				o.getStatus().next().stream().map(StatusInfo::of).toList(),
				history.stream().map(HistoryEntry::of).toList(), plan);
	}
}
