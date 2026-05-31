package com.railway.mq.consumer;

import com.railway.common.constant.MqConstants;
import com.railway.common.dto.TrainStatusReportDTO;
import com.railway.common.entity.TrainStatus;
import com.railway.common.util.CompressUtil;
import com.railway.mq.producer.TrainStatusProducer;
import com.railway.protocol.exception.ProtocolParseException;
import com.railway.protocol.service.ProtocolParseService;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.annotation.ConsumeMode;
import org.apache.rocketmq.spring.annotation.MessageModel;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;

@Component
@RocketMQMessageListener(
        topic = MqConstants.TOPIC_TRAIN_STATUS_REPORT,
        consumerGroup = MqConstants.CONSUMER_GROUP_TRAIN_PARSE,
        selectorExpression = MqConstants.TAG_RAW_DATA,
        consumeMode = ConsumeMode.CONCURRENTLY,
        messageModel = MessageModel.CLUSTERING,
        consumeThreadMax = 32
)
public class TrainStatusParseConsumer implements RocketMQListener<TrainStatusReportDTO> {

    private static final Logger log = LoggerFactory.getLogger(TrainStatusParseConsumer.class);
    private static final Logger errorLog = LoggerFactory.getLogger("PROTOCOL_ERROR_LOGGER");
    private static final Logger backpressureLog = LoggerFactory.getLogger("BACKPRESSURE_LOGGER");

    private static final AtomicLong totalConsumed = new AtomicLong(0);
    private static final AtomicLong totalErrors = new AtomicLong(0);
    private static final AtomicLong lastLogTime = new AtomicLong(System.currentTimeMillis());

    @Resource
    private ProtocolParseService protocolParseService;

    @Resource
    private TrainStatusProducer trainStatusProducer;

    @Value("${app.consumer.backpressure-threshold:10000}")
    private long backpressureThreshold;

    @Value("${app.consumer.drop-old-data:false}")
    private boolean dropOldData;

    @Override
    public void onMessage(TrainStatusReportDTO reportDTO) {
        if (reportDTO == null) {
            log.warn("Received null report DTO, skip");
            return;
        }

        long count = totalConsumed.incrementAndGet();
        reportDTO.setReceiveTime(LocalDateTime.now());

        if (count % 1000 == 0) {
            long now = System.currentTimeMillis();
            long elapsed = now - lastLogTime.getAndSet(now);
            double qps = elapsed > 0 ? (1000.0 * 1000 / elapsed) : 0;
            log.info("Parse consumer stats - total: {}, errors: {}, qps: {:.2f}",
                    count, totalErrors.get(), qps);
        }

        String trainId = reportDTO.getTrainId();

        try {
            if (reportDTO.getRawData() != null && CompressUtil.isCompressed(reportDTO.getRawData())) {
                reportDTO.setRawData(CompressUtil.decompress(reportDTO.getRawData()));
            }

            log.debug("Start parsing train status, trainId: {}, data length: {}",
                    trainId, reportDTO.getRawData() != null ? reportDTO.getRawData().length : 0);

            TrainStatus status = protocolParseService.parse(reportDTO);

            if (status == null) {
                handleParseError(reportDTO, "PARSE_RETURNED_NULL", "Protocol parse returned null");
                return;
            }

            trainStatusProducer.sendParsedData(status);

            log.debug("Parse success, trainId: {}, status: {}, speed: {}, protocol: {}",
                    trainId, status.getStatus(), status.getSpeed(), status.getProtocolVersion());

        } catch (ProtocolParseException e) {
            handleParseError(reportDTO, e.getErrorCode(), e.getMessage());
        } catch (Exception e) {
            handleParseError(reportDTO, "UNEXPECTED_ERROR", e.getMessage());
        }
    }

    private void handleParseError(TrainStatusReportDTO reportDTO, String errorCode, String errorMessage) {
        totalErrors.incrementAndGet();
        String trainId = reportDTO.getTrainId();

        errorLog.error("Protocol parse failed | trainId: {} | errorCode: {} | message: {} | sourceIp: {} | data: {}",
                trainId, errorCode, errorMessage,
                reportDTO.getSourceIp(),
                reportDTO.getRawDataHex());

        try {
            trainStatusProducer.sendErrorData(reportDTO, errorCode, errorMessage);
        } catch (Exception e) {
            log.error("Failed to send error data to error queue, trainId: {}", trainId, e);
        }
    }

    public static long getTotalConsumed() {
        return totalConsumed.get();
    }

    public static long getTotalErrors() {
        return totalErrors.get();
    }
}

