package com.specimen.auth;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication(scanBasePackages = {"com.specimen.auth", "com.specimen.common"})
@EnableDiscoveryClient
@MapperScan("com.specimen.auth.mapper")
public class SpecimenAuthApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpecimenAuthApplication.class, args);
    }
}
