package com.railway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.railway")
@EnableScheduling
public class TrainStatusApplication {

    public static void main(String[] args) {
        SpringApplication.run(TrainStatusApplication.class, args);
        System.out.println("================================================");
        System.out.println("  轨道交通车载单元状态上报API集群服务启动成功!");
        System.out.println("  Train Status Report API Cluster Started!");
        System.out.println("================================================");
    }
}
