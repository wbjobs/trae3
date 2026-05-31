package com.smartmeter.forward;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = {"com.smartmeter.forward", "com.smartmeter.common"})
@EnableDiscoveryClient
@EnableFeignClients
@EnableScheduling
public class DataForwardApplication {
    public static void main(String[] args) {
        SpringApplication.run(DataForwardApplication.class, args);
    }
}
