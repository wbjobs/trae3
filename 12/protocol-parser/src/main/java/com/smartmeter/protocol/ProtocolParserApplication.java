package com.smartmeter.protocol;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication(scanBasePackages = {"com.smartmeter.protocol", "com.smartmeter.common"})
@EnableDiscoveryClient
public class ProtocolParserApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProtocolParserApplication.class, args);
    }
}
