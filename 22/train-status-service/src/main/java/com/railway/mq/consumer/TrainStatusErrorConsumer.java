package com.railway.mq.consumer;

import com.alibaba.fastjson2.JSON;
import com.railway.common.constant.MqConstants;
import com.railway.common.dto.TrainStatusReportDTO;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicLong;

@Component
@RocketMQMessageListener(
        topic = MqConstants.TOPIC_TRAIN_STATUS_DEAD,
        consumerGroup = "TRAIN_ERROR_CONSUMER_GROUP",
        selectorExpression = MqConstants.TAG_ERROR_DATA
)
public class TrainStatusErrorConsumer implements RocketMQListener<TrainStatusReportDTO> {

    private static final Logger log = LoggerFactory.getLogger(TrainStatusErrorConsumer.class);
    private static final Logger errorLog = LoggerFactory.getLogger("PROTOCOL_ERROR_LOGGER");

    private static final String ERROR_DATA_DIR = "./error-data/";
    private static final AtomicLong counter = new AtomicLong(0);

    private volatile String currentDate;
    private volatile PrintWriter currentWriter;

    public TrainStatusErrorConsumer() {
        File dir = new File(ERROR_DATA_DIR);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        this.currentDate = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        openCurrentWriter();
    }

    @Override
    public void onMessage(TrainStatusReportDTO reportDTO) {
        if (reportDTO == null) {
            return;
        }

        try {
            counter.incrementAndGet();

            errorLog.error("Received error data | trainId: {} | errorCode: {} | errorMessage: {} | " +
                            "sourceIp: {} | dataLen: {}",
                    reportDTO.getTrainId(),
                    reportDTO.getErrorCode(),
                    reportDTO.getErrorMessage(),
                    reportDTO.getSourceIp(),
                    reportDTO.getRawData() != null ? reportDTO.getRawData().length : 0);

            persistErrorData(reportDTO);

            if (counter.get() % 100 == 0) {
                log.warn("Total error data received: {}", counter.get());
            }

        } catch (Exception e) {
            log.error("Process error data failed, trainId: {}", reportDTO.getTrainId(), e);
        }
    }

    private synchronized void persistErrorData(TrainStatusReportDTO reportDTO) {
        try {
            String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
            if (!today.equals(currentDate)) {
                closeCurrentWriter();
                currentDate = today;
                openCurrentWriter();
            }

            if (currentWriter != null) {
                String json = JSON.toJSONString(new ErrorDataRecord(reportDTO));
                currentWriter.println(json);
                currentWriter.flush();
            }
        } catch (Exception e) {
            log.error("Persist error data failed", e);
        }
    }

    private void openCurrentWriter() {
        try {
            File file = new File(ERROR_DATA_DIR + "error-" + currentDate + ".log");
            currentWriter = new PrintWriter(new FileWriter(file, true), true);
        } catch (IOException e) {
            log.error("Open error data writer failed", e);
        }
    }

    private void closeCurrentWriter() {
        if (currentWriter != null) {
            currentWriter.close();
            currentWriter = null;
        }
    }

    public static class ErrorDataRecord {
        private String trainId;
        private String lineId;
        private String errorCode;
        private String errorMessage;
        private String sourceIp;
        private String rawDataHex;
        private Long timestamp;
        private String receiveTime;

        public ErrorDataRecord(TrainStatusReportDTO dto) {
            this.trainId = dto.getTrainId();
            this.lineId = dto.getLineId();
            this.errorCode = dto.getErrorCode();
            this.errorMessage = dto.getErrorMessage();
            this.sourceIp = dto.getSourceIp();
            this.rawDataHex = dto.getRawDataHex();
            this.timestamp = dto.getTimestamp();
            this.receiveTime = dto.getReceiveTime() != null ? dto.getReceiveTime().toString() : null;
        }

        public String getTrainId() {
            return trainId;
        }

        public String getLineId() {
            return lineId;
        }

        public String getErrorCode() {
            return errorCode;
        }

        public String getErrorMessage() {
            return errorMessage;
        }

        public String getSourceIp() {
            return sourceIp;
        }

        public String getRawDataHex() {
            return rawDataHex;
        }

        public Long getTimestamp() {
            return timestamp;
        }

        public String getReceiveTime() {
            return receiveTime;
        }
    }
}
