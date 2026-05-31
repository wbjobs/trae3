package com.ancient.platform.common.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * JWT配置类
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "jwt")
public class JwtConfig {

    /**
     * JWT密钥
     */
    private String secret = "ancient-platform-secret-key-2024";

    /**
     * 过期时间（秒），默认24小时
     */
    private Long expire = 86400L;

    /**
     * 令牌前缀
     */
    private String prefix = "Bearer ";

    /**
     * 请求头
     */
    private String header = "Authorization";

    /**
     * 刷新令牌过期时间（秒），默认7天
     */
    private Long refreshExpire = 604800L;
}
