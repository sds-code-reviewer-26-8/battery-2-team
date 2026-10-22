package com.example.demo.controller.dto;

import com.example.demo.entity.OrderStatusHistory;
import java.time.format.DateTimeFormatter;

/** 상태 이력 한 줄. 최초 확정은 이전 상태(from)가 없다. */
public record HistoryEntry(String changedAt, StatusInfo from, StatusInfo to, String changedBy) {

	private static final DateTimeFormatter SECOND = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

	public static HistoryEntry of(OrderStatusHistory h) {
		return new HistoryEntry(h.getChangedAt().format(SECOND),
				h.getFromStatus() == null ? null : StatusInfo.of(h.getFromStatus()), StatusInfo.of(h.getToStatus()),
				h.getChangedBy());
	}
}
