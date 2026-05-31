package com.ancient.platform;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 古籍数字化勘校平台主启动类
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@SpringBootApplication(scanBasePackages = "com.ancient.platform")
@MapperScan(basePackages = {
        "com.ancient.platform.auth.mapper",
        "com.ancient.platform.project.mapper",
        "com.ancient.platform.file.mapper"
})
@EnableCaching
@EnableAsync
@EnableScheduling
@EnableAspectJAutoProxy(exposeProxy = true)
public class AncientPlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(AncientPlatformApplication.class, args);
        System.out.println("""
                ========================================================
                   古籍数字化勘校平台启动成功！
                   接口文档: http://localhost:8080/doc.html
                   首页:     http://localhost:8080/
                ========================================================
                """);
    }
}
