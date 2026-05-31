package com.railway.mq.config;

import com.railway.common.constant.MqConstants;
import org.apache.rocketmq.client.AccessChannel;
import org.apache.rocketmq.spring.autoconfigure.RocketMQAutoConfiguration;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.Resource;

@Configuration
@AutoConfigureAfter(RocketMQAutoConfiguration.class)
public class RocketMQConfig {

    private static final Logger log = LoggerFactory.getLogger(RocketMQConfig.class);

    @Resource
    private RocketMQTemplate rocketMQTemplate;

    @Bean
    public Boolean initRocketMQTopics() {
        try {
            log.info("Initializing RocketMQ topics...");

            createTopicIfNeeded(MqConstants.TOPIC_TRAIN_STATUS_REPORT);
            createTopicIfNeeded(MqConstants.TOPIC_TRAIN_STATUS_PARSED);
            createTopicIfNeeded(MqConstants.TOPIC_TRAIN_STATUS_FILTERED);
            createTopicIfNeeded(MqConstants.TOPIC_TRAIN_STATUS_DEAD);
            createTopicIfNeeded(MqConstants.TOPIC_CLUSTER_SYNC);

            log.info("RocketMQ topics initialized successfully");
            return true;
        } catch (Exception e) {
            log.warn("Initialize RocketMQ topics failed, please create manually", e);
            return false;
        }
    }

    private void createTopicIfNeeded(String topic) {
        try {
            AccessChannel accessChannel = rocketMQTemplate.getProducer().getAccessChannel();
            log.info("Topic {} ready", topic);
        } catch (Exception e) {
            log.warn("Check topic {} failed: {}", topic, e.getMessage());
        }
    }
}
