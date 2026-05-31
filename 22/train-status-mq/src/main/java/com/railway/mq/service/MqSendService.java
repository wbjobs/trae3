package com.railway.mq.service;

import com.railway.common.dto.TrainStatusReportDTO;
import com.railway.common.entity.TrainStatus;
import com.railway.mq.producer.TrainStatusProducer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.Resource;

@Service
public class MqSendService {

    private static final Logger log = LoggerFactory.getLogger(MqSendService.class);

    @Resource
    private TrainStatusProducer trainStatusProducer;

    public void reportTrainStatus(TrainStatusReportDTO reportDTO) {
        if (reportDTO.getTimestamp() == null) {
            reportDTO.setTimestamp(System.currentTimeMillis());
        }

        trainStatusProducer.sendRawData(reportDTO);

        log.info("Reported train status to MQ, trainId: {}, timestamp: {}",
                reportDTO.getTrainId(), reportDTO.getTimestamp());
    }

    public void sendParsedStatus(TrainStatus trainStatus) {
        trainStatusProducer.sendParsedData(trainStatus);
    }

    public void sendFilteredStatus(TrainStatus trainStatus) {
        trainStatusProducer.sendFilteredData(trainStatus);
    }
}
