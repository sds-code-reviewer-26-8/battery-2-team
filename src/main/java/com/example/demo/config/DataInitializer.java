package com.example.demo.config;

import com.example.demo.service.MasterService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements ApplicationRunner {

	private final MasterService masters;

	public DataInitializer(MasterService masters) {
		this.masters = masters;
	}

	@Override
	public void run(ApplicationArguments args) {
		masters.initDefaults();
	}
}
