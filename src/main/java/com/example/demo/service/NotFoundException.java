package com.example.demo.service;

/** 찾는 주문이 없을 때의 업무 오류. API 는 이것을 404 로 응답한다. */
public class NotFoundException extends BusinessException {

	public NotFoundException(String message) {
		super(message);
	}
}
