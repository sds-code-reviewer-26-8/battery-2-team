package com.example.demo.repository;

import com.example.demo.entity.OrderStatus;

/** 상태별 주문 수 집계 한 줄 */
public interface StatusCount {

	OrderStatus getStatus();

	long getTotal();
}
