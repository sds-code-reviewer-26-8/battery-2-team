package com.example.demo.repository;

import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.entity.OrderStatusHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public final class OrderRepositories {

	private OrderRepositories() {
	}

	public interface OrderStatusHistoryRepository extends JpaRepository<OrderStatusHistory, Long> {

		List<OrderStatusHistory> findByOrderIdOrderByIdAsc(Long orderId);
	}

	public interface StatusCount {

		OrderStatus getStatus();

		long getTotal();
	}

	public interface OrderRepository extends JpaRepository<Order, Long> {

		/** 상태별 주문 수를 쿼리 한 번으로 구한다. 주문이 하나도 없는 상태는 결과에 나오지 않는다. */
		@Query("select o.status as status, count(o) as total from Order o group by o.status")
		List<StatusCount> countGroupedByStatus();

		List<Order> findByStatusOrderByIdDesc(OrderStatus status);

		List<Order> findAllByOrderByIdDesc();
	}
}
