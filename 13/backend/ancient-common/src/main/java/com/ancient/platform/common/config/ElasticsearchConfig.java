package com.ancient.platform.common.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.elasticsearch.repository.config.EnableElasticsearchRepositories;

/**
 * Elasticsearch配置类
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Configuration
@ConditionalOnClass(EnableElasticsearchRepositories.class)
@EnableElasticsearchRepositories(basePackages = "com.ancient.platform.search.repository")
public class ElasticsearchConfig {

}
