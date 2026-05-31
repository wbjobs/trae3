package com.railway.config;

import com.railway.common.util.CircuitBreaker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ServiceGovernanceConfig {

    @Value("${app.circuit-breaker.mysql.failure-threshold:20}")
    private int mysqlFailureThreshold;

    @Value("${app.circuit-breaker.mysql.timeout-seconds:30}")
    private int mysqlTimeoutSeconds;

    @Value("${app.circuit-breaker.rocketmq.failure-threshold:50}")
    private int rocketmqFailureThreshold;

    @Value("${app.circuit-breaker.rocketmq.timeout-seconds:15}")
    private int rocketmqTimeoutSeconds;

    @Value("${app.circuit-breaker.redis.failure-threshold:30}")
    private int redisFailureThreshold;

    @Value("${app.circuit-breaker.redis.timeout-seconds:20}")
    private int redisTimeoutSeconds;

    @Bean
    public CircuitBreaker mysqlCircuitBreaker() {
        return new CircuitBreaker("mysql", mysqlFailureThreshold,
                mysqlTimeoutSeconds * 1000L, 5);
    }

    @Bean
    public CircuitBreaker rocketmqCircuitBreaker() {
        return new CircuitBreaker("rocketmq", rocketmqFailureThreshold,
                rocketmqTimeoutSeconds * 1000L, 10);
    }

    @Bean
    public CircuitBreaker redisCircuitBreaker() {
        return new CircuitBreaker("redis", redisFailureThreshold,
                redisTimeoutSeconds * 1000L, 10);
    }
}
