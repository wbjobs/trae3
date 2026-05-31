package com.railway.filter.impl;

import com.railway.common.entity.TrainStatus;
import com.railway.filter.TrainStatusFilter;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Component
public class DataCleaningFilter implements TrainStatusFilter {

    private static final Logger log = LoggerFactory.getLogger(DataCleaningFilter.class);

    @Override
    public String getFilterName() {
        return "DataCleaningFilter";
    }

    @Override
    public int getOrder() {
        return 25;
    }

    @Override
    public boolean test(TrainStatus trainStatus) {
        if (trainStatus.getTrainId() != null) {
            trainStatus.setTrainId(cleanString(trainStatus.getTrainId(), 20));
        }

        if (trainStatus.getLineId() != null) {
            trainStatus.setLineId(cleanString(trainStatus.getLineId(), 10));
        }

        if (trainStatus.getNextStationName() != null) {
            trainStatus.setNextStationName(cleanString(trainStatus.getNextStationName(), 50));
        }

        if (trainStatus.getAlertCodes() != null) {
            trainStatus.setAlertCodes(cleanString(trainStatus.getAlertCodes(), 200));
        }

        if (trainStatus.getDeviceStates() != null) {
            trainStatus.setDeviceStates(cleanString(trainStatus.getDeviceStates(), 1000));
        }

        if (trainStatus.getProtocolVersion() != null) {
            trainStatus.setProtocolVersion(cleanString(trainStatus.getProtocolVersion(), 10));
        }

        if (trainStatus.getNodeId() != null) {
            trainStatus.setNodeId(cleanString(trainStatus.getNodeId(), 50));
        }

        cleanInvalidCharacters(trainStatus);

        return true;
    }

    private String cleanString(String value, int maxLength) {
        if (value == null) {
            return null;
        }

        String cleaned = value.trim();

        cleaned = cleaned.replaceAll("[\\x00-\\x1F\\x7F]", "");

        if (cleaned.getBytes(StandardCharsets.UTF_8).length > maxLength) {
            byte[] bytes = cleaned.getBytes(StandardCharsets.UTF_8);
            cleaned = new String(bytes, 0, maxLength, StandardCharsets.UTF_8);
        }

        return cleaned;
    }

    private void cleanInvalidCharacters(TrainStatus trainStatus) {
        if (StringUtils.isBlank(trainStatus.getTrainId())) {
            log.debug("DataCleaningFilter: trainId is blank after cleaning");
        }
    }
}
