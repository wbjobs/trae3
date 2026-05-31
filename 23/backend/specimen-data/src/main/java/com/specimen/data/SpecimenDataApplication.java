package com.specimen.data;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication
@EnableDiscoveryClient
@EnableFeignClients
@MapperScan("com.specimen.data.mapper")
public class SpecimenDataApplication {
    public static void main(String[] args) {
        SpringApplication.run(SpecimenDataApplication.class, args);
    }
}
