package com.smartmeter.cache;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication(scanBasePackages = {"com.smartmeter.cache", "com.smartmeter.common"})
@EnableDiscoveryClient
@MapperScan("com.smartmeter.cache.mapper")
public class DataCacheApplication {
    public static void main(String[] args) {
        SpringApplication.run(DataCacheApplication.class, args);
    }
}
