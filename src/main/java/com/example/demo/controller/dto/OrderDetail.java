package com.example.demo.controller.dto;

import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatusHistory;
import com.example.demo.simulation.StoredPlan;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 주문 상세 화면에 필요한 모든 값. version 은 상태를 바꿀 때 함께 보내야 하고, plan 은 확정 때 저장한 계획이다.
 * dueAsap·dueDate(yyyy-MM-dd)·dueExceeded 는 필요 납기이며, 납기 기능 전에 확정된 주문은 모두 null 이다.
 */
public record OrderDetail(Long id, String confirmedAt, String createdBy, String routeLabel, String memo,
		String customerName, boolean customerEditable, StatusInfo status, long version, List<StatusInfo> nextStatuses,
		List<HistoryEntry> history, StoredPlan plan, Boolean dueAsap, String dueDate, Boolean dueExceeded) {

	private static final DateTimeFormatter MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

	public static OrderDetail of(Order o, List<OrderStatusHistory> history, StoredPlan plan) {
		return new OrderDetail(o.getId(), o.getConfirmedAt().format(MINUTE), o.getCreatedBy(), o.getRouteLabel(),
				o.getMemo(), o.getCustomerName(), o.getStatus().isCustomerEditable(), StatusInfo.of(o.getStatus()), o.getVersion(),
				o.getStatus().next().stream().map(StatusInfo::of).toList(),
				history.stream().map(HistoryEntry::of).toList(), plan, o.getDueAsap(),
				o.getDueDate() == null ? null : o.getDueDate().toString(), o.getDueExceeded());
	}
}
