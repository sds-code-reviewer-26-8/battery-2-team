package com.example.demo.controller;

import com.example.demo.service.BusinessException;
import com.example.demo.service.NotFoundException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 모든 JSON API 의 업무 오류를 한 곳에서 응답으로 바꾼다.
 * 없는 주문은 404, 충돌(마스터 변경·동시 변경)은 409, 그 외 입력 오류는 400. 본문은 {error, conflict, errors} 이다.
 * errors 는 이유가 여러 개일 때(마스터 저장) 하나씩 담은 목록이고, error 는 그것을 한 줄로 이은 글이다.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(BusinessException.class)
	public ResponseEntity<Map<String, Object>> businessError(BusinessException e) {
		return body(e.isConflict() ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST, e);
	}

	@ExceptionHandler(NotFoundException.class)
	public ResponseEntity<Map<String, Object>> notFound(NotFoundException e) {
		return body(HttpStatus.NOT_FOUND, e);
	}

	private static ResponseEntity<Map<String, Object>> body(HttpStatus status, BusinessException e) {
		return ResponseEntity.status(status)
				.body(Map.of("error", e.getMessage(), "conflict", e.isConflict(), "errors", e.getMessages()));
	}
}
