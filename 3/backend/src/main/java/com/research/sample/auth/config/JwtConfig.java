package com.research.sample.auth.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "jwt")
public class JwtConfig {

    private String secret = "default-secret-key-for-research-sample-auth-module-must-be-at-least-256-bits-long";
    private long expiration = 86400000L;
}
