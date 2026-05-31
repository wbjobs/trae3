package com.railway.mq.consumer;

import com.railway.common.constant.MqConstants;
import com.railway.common.entity.TrainStatus;
import com.railway.mq.producer.TrainStatusProducer;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import jakarta.annotation.Resource;
import java.util.function.Predicate;

@Component
@RocketMQMessageListener(
        topic = MqConstants.TOPIC_TRAIN_STATUS_PARSED,
        consumerGroup = MqConstants.CONSUMER_GROUP_TRAIN_FILTER,
        selectorExpression = MqConstants.TAG_PARSED_DATA
)
public class TrainStatusFilterConsumer implements RocketMQListener<TrainStatus> {

    private static final Logger log = LoggerFactory.getLogger(TrainStatusFilterConsumer.class);

    @Resource(name = "trainStatusFilterChain")
    private Predicate<TrainStatus> filterChain;

    @Resource
    private TrainStatusProducer trainStatusProducer;

    @Override
    public void onMessage(TrainStatus trainStatus) {
        if (trainStatus == null) {
            log.warn("Received null train status, skip");
            return;
        }

        try {
            log.debug("Start filtering train status, trainId: {}", trainStatus.getTrainId());

            boolean pass = filterChain.test(trainStatus);

            if (pass) {
                trainStatusProducer.sendFilteredData(trainStatus);
                log.debug("Filter passed, trainId: {}, status: {}", trainStatus.getTrainId(), trainStatus.getStatus());
            } else {
                log.debug("Filter rejected, trainId: {}, status: {}", trainStatus.getTrainId(), trainStatus.getStatus());
            }

        } catch (Exception e) {
            log.error("Filter train status failed, trainId: {}", trainStatus.getTrainId(), e);
        }
    }
}
