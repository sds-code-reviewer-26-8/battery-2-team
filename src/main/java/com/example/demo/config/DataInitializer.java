package com.example.demo.config;

import com.example.demo.service.MasterService;
import com.example.demo.service.MemberService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements ApplicationRunner {

	private final MasterService masters;
	private final MemberService members;

	public DataInitializer(MasterService masters, MemberService members) {
		this.masters = masters;
		this.members = members;
	}

	@Override
	public void run(ApplicationArguments args) {
		masters.initDefaults();
		members.initDefaultAdmin();
	}
}
