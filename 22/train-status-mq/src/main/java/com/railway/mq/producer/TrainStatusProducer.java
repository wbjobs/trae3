package com.railway.mq.producer;

import com.alibaba.fastjson2.JSON;
import com.railway.common.constant.MqConstants;
import com.railway.common.dto.TrainStatusReportDTO;
import com.railway.common.entity.TrainStatus;
import com.railway.common.util.IdGeneratorUtil;
import org.apache.rocketmq.client.producer.SendCallback;
import org.apache.rocketmq.client.producer.SendResult;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;

import jakarta.annotation.Resource;

@Component
public class TrainStatusProducer {

    private static final Logger log = LoggerFactory.getLogger(TrainStatusProducer.class);

    @Resource
    private RocketMQTemplate rocketMQTemplate;

    public void sendRawData(TrainStatusReportDTO reportDTO) {
        String messageId = IdGeneratorUtil.generateMessageId();
        String destination = MqConstants.TOPIC_TRAIN_STATUS_REPORT + ":" + MqConstants.TAG_RAW_DATA;

        Message<TrainStatusReportDTO> message = MessageBuilder.withPayload(reportDTO)
                .setHeader("KEYS", reportDTO.getTrainId())
                .setHeader("MSG_ID", messageId)
                .setHeader("TIMESTAMP", System.currentTimeMillis())
                .build();

        rocketMQTemplate.asyncSend(destination, message, new SendCallback() {
            @Override
            public void onSuccess(SendResult sendResult) {
                log.debug("Send raw data success, trainId: {}, msgId: {}", reportDTO.getTrainId(), messageId);
            }

            @Override
            public void onException(Throwable e) {
                log.error("Send raw data failed, trainId: {}, msgId: {}", reportDTO.getTrainId(), messageId, e);
            }
        });
    }

    public void sendParsedData(TrainStatus trainStatus) {
        String messageId = IdGeneratorUtil.generateMessageId();
        String destination = MqConstants.TOPIC_TRAIN_STATUS_PARSED + ":" + MqConstants.TAG_PARSED_DATA;

        Message<TrainStatus> message = MessageBuilder.withPayload(trainStatus)
                .setHeader("KEYS", trainStatus.getTrainId())
                .setHeader("MSG_ID", messageId)
                .setHeader("TRAIN_ID", trainStatus.getTrainId())
                .setHeader("STATUS", trainStatus.getStatus())
                .setHeader("TIMESTAMP", System.currentTimeMillis())
                .build();

        rocketMQTemplate.asyncSend(destination, message, new SendCallback() {
            @Override
            public void onSuccess(SendResult sendResult) {
                log.debug("Send parsed data success, trainId: {}, msgId: {}", trainStatus.getTrainId(), messageId);
            }

            @Override
            public void onException(Throwable e) {
                log.error("Send parsed data failed, trainId: {}, msgId: {}", trainStatus.getTrainId(), messageId, e);
            }
        });
    }

    public void sendFilteredData(TrainStatus trainStatus) {
        String messageId = IdGeneratorUtil.generateMessageId();
        String destination = MqConstants.TOPIC_TRAIN_STATUS_FILTERED + ":" + MqConstants.TAG_FILTERED_DATA;

        Message<TrainStatus> message = MessageBuilder.withPayload(trainStatus)
                .setHeader("KEYS", trainStatus.getTrainId())
                .setHeader("MSG_ID", messageId)
                .setHeader("TRAIN_ID", trainStatus.getTrainId())
                .setHeader("STATUS", trainStatus.getStatus())
                .setHeader("TIMESTAMP", System.currentTimeMillis())
                .build();

        rocketMQTemplate.asyncSend(destination, message, new SendCallback() {
            @Override
            public void onSuccess(SendResult sendResult) {
                log.debug("Send filtered data success, trainId: {}, msgId: {}", trainStatus.getTrainId(), messageId);
            }

            @Override
            public void onException(Throwable e) {
                log.error("Send filtered data failed, trainId: {}, msgId: {}", trainStatus.getTrainId(), messageId, e);
            }
        });
    }

    public void sendErrorData(TrainStatusReportDTO reportDTO, String errorCode, String errorMessage) {
        String messageId = IdGeneratorUtil.generateMessageId();
        String destination = MqConstants.TOPIC_TRAIN_STATUS_DEAD + ":" + MqConstants.TAG_ERROR_DATA;

        reportDTO.setErrorCode(errorCode);
        reportDTO.setErrorMessage(errorMessage);

        Message<TrainStatusReportDTO> message = MessageBuilder.withPayload(reportDTO)
                .setHeader("KEYS", reportDTO.getTrainId())
                .setHeader("MSG_ID", messageId)
                .setHeader("ERROR_CODE", errorCode)
                .setHeader("TIMESTAMP", System.currentTimeMillis())
                .build();

        rocketMQTemplate.sendOneWay(destination, message);
        log.warn("Sent error data to dead letter topic, trainId: {}, errorCode: {}", reportDTO.getTrainId(), errorCode);
    }

    public void sendClusterSyncMessage(Object data, String tag) {
        String messageId = IdGeneratorUtil.generateMessageId();
        String destination = MqConstants.TOPIC_CLUSTER_SYNC + ":" + tag;

        String payload = JSON.toJSONString(data);
        Message<String> message = MessageBuilder.withPayload(payload)
                .setHeader("KEYS", messageId)
                .setHeader("MSG_ID", messageId)
                .setHeader("TIMESTAMP", System.currentTimeMillis())
                .build();

        rocketMQTemplate.sendOneWay(destination, message);
        log.debug("Send cluster sync message, tag: {}, msgId: {}", tag, messageId);
    }
}
