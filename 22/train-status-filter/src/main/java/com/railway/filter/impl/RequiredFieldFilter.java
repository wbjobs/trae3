package com.railway.filter.impl;

import com.railway.common.entity.TrainStatus;
import com.railway.filter.TrainStatusFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class RequiredFieldFilter implements TrainStatusFilter {

    private static final Logger log = LoggerFactory.getLogger(RequiredFieldFilter.class);

    @Override
    public String getFilterName() {
        return "RequiredFieldFilter";
    }

    @Override
    public int getOrder() {
        return 10;
    }

    @Override
    public boolean test(TrainStatus trainStatus) {
        if (trainStatus == null) {
            log.warn("RequiredFieldFilter rejected: trainStatus is null");
            return false;
        }

        if (trainStatus.getTrainId() == null || trainStatus.getTrainId().trim().isEmpty()) {
            log.warn("RequiredFieldFilter rejected: trainId is null or empty");
            return false;
        }

        if (trainStatus.getReportTime() == null) {
            log.warn("RequiredFieldFilter rejected: reportTime is null, trainId: {}",
                    trainStatus.getTrainId());
            return false;
        }

        if (trainStatus.getStatus() == null) {
            log.warn("RequiredFieldFilter rejected: status is null, trainId: {}",
                    trainStatus.getTrainId());
            return false;
        }

        return true;
    }
}
