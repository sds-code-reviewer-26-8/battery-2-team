package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "orders")
public class Order {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private LocalDateTime confirmedAt;

	@Column(nullable = false)
	private String createdBy;

	/** 총 주문 수량(K) */
	private int totalK;

	private String routeType;

	private String routeLabel;

	private int totalDays;

	private long productionCost;

	private long shippingCost;

	private long totalCost;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private OrderStatus status;

	@Column(length = 1000)
	private String memo;

	/** 확정 시점의 계획 스냅샷(주문 수량, 마스터 값, 경로, 일별 생산) JSON */
	@Lob
	@Column(nullable = false)
	private String planJson;

	/** 필요 납기: '가능한 빨리'이면 true. 납기 기능 전에 확정된 주문은 세 값 모두 NULL 이다(G1). */
	private Boolean dueAsap;

	/** 필요 납기일('가능한 빨리'이면 NULL) */
	private LocalDate dueDate;

	/** 확정한 경로의 총 소요일이 납기 일수를 넘는지(서버 계산). '가능한 빨리'이면 NULL */
	private Boolean dueExceeded;

	@Version
	private long version;

	protected Order() {
	}

	public Order(LocalDateTime confirmedAt, String createdBy, int totalK, String routeType, String routeLabel,
			int totalDays, long productionCost, long shippingCost, long totalCost, String memo, String planJson) {
		this.confirmedAt = confirmedAt;
		this.createdBy = createdBy;
		this.totalK = totalK;
		this.routeType = routeType;
		this.routeLabel = routeLabel;
		this.totalDays = totalDays;
		this.productionCost = productionCost;
		this.shippingCost = shippingCost;
		this.totalCost = totalCost;
		this.memo = memo;
		this.planJson = planJson;
		this.status = OrderStatus.CONFIRMED;
	}

	public Long getId() {
		return id;
	}

	public LocalDateTime getConfirmedAt() {
		return confirmedAt;
	}

	public String getCreatedBy() {
		return createdBy;
	}

	public int getTotalK() {
		return totalK;
	}

	public String getRouteType() {
		return routeType;
	}

	public String getRouteLabel() {
		return routeLabel;
	}

	public int getTotalDays() {
		return totalDays;
	}

	public long getProductionCost() {
		return productionCost;
	}

	public long getShippingCost() {
		return shippingCost;
	}

	public long getTotalCost() {
		return totalCost;
	}

	public OrderStatus getStatus() {
		return status;
	}

	public void setStatus(OrderStatus status) {
		this.status = status;
	}

	public String getMemo() {
		return memo;
	}

	public String getPlanJson() {
		return planJson;
	}

	public long getVersion() {
		return version;
	}

	/** 확정 때 한 번만 정한다 */
	public void setDue(Boolean dueAsap, LocalDate dueDate, Boolean dueExceeded) {
		this.dueAsap = dueAsap;
		this.dueDate = dueDate;
		this.dueExceeded = dueExceeded;
	}

	public Boolean getDueAsap() {
		return dueAsap;
	}

	public LocalDate getDueDate() {
		return dueDate;
	}

	public Boolean getDueExceeded() {
		return dueExceeded;
	}

	/** 억 원 단위, 소수 2자리 */
	public String getTotalCostEok() {
		return eok(totalCost);
	}

	public String getProductionCostEok() {
		return eok(productionCost);
	}

	public String getShippingCostEok() {
		return eok(shippingCost);
	}

	private static String eok(long won) {
		return String.format("%.2f", won / 100_000_000.0);
	}
}
