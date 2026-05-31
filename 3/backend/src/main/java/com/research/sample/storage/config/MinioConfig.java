package com.research.sample.storage.config;

import io.minio.MinioClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(MinioProperties.class)
public class MinioConfig {

    @Bean
    public MinioClient minioClient(MinioProperties properties) {
        return MinioClient.builder()
                .endpoint(properties.getEndpoint())
                .credentials(properties.getAccessKey(), properties.getSecretKey())
                .build();
    }

    @Bean
    public Void initBucket(MinioClient minioClient, MinioProperties properties) {
        try {
            if (!minioClient.bucketExists(b -> b.bucket(properties.getBucketName()))) {
                minioClient.makeBucket(b -> b.bucket(properties.getBucketName()));
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to initialize MinIO bucket", e);
        }
        return null;
    }
}
