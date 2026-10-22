package com.example.demo.controller.dto;

import java.util.List;
import java.util.Map;

/** 주문 목록 화면에 필요한 모든 값: 목록, 상태별 개수, 전체 개수, 상태 종류 */
public record OrderList(List<OrderSummary> orders, Map<String, Long> counts, long total, List<StatusInfo> statuses) {
}
