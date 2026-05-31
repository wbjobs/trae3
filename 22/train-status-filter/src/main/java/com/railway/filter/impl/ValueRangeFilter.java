package com.railway.filter.impl;

import com.railway.common.constant.ProtocolConstants;
import com.railway.common.entity.TrainStatus;
import com.railway.filter.TrainStatusFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ValueRangeFilter implements TrainStatusFilter {

    private static final Logger log = LoggerFactory.getLogger(ValueRangeFilter.class);

    private static final double MAX_SPEED = 200.0;
    private static final double MIN_LONGITUDE = 73.0;
    private static final double MAX_LONGITUDE = 135.0;
    private static final double MIN_LATITUDE = 18.0;
    private static final double MAX_LATITUDE = 54.0;
    private static final int MAX_PASSENGER_COUNT = 2000;

    @Override
    public String getFilterName() {
        return "ValueRangeFilter";
    }

    @Override
    public int getOrder() {
        return 30;
    }

    @Override
    public boolean test(TrainStatus trainStatus) {
        String trainId = trainStatus.getTrainId();

        if (trainStatus.getSpeed() != null
                && (trainStatus.getSpeed() < 0 || trainStatus.getSpeed() > MAX_SPEED)) {
            log.warn("ValueRangeFilter: speed out of range, trainId: {}, speed: {}",
                    trainId, trainStatus.getSpeed());
            trainStatus.setSpeed(0.0);
        }

        if (trainStatus.getLongitude() != null
                && (trainStatus.getLongitude() < MIN_LONGITUDE
                || trainStatus.getLongitude() > MAX_LONGITUDE)) {
            log.warn("ValueRangeFilter: longitude out of range, trainId: {}, longitude: {}",
                    trainId, trainStatus.getLongitude());
            trainStatus.setLongitude(null);
        }

        if (trainStatus.getLatitude() != null
                && (trainStatus.getLatitude() < MIN_LATITUDE
                || trainStatus.getLatitude() > MAX_LATITUDE)) {
            log.warn("ValueRangeFilter: latitude out of range, trainId: {}, latitude: {}",
                    trainId, trainStatus.getLatitude());
            trainStatus.setLatitude(null);
        }

        if (trainStatus.getPassengerCount() != null
                && (trainStatus.getPassengerCount() < 0
                || trainStatus.getPassengerCount() > MAX_PASSENGER_COUNT)) {
            log.warn("ValueRangeFilter: passengerCount out of range, trainId: {}, count: {}",
                    trainId, trainStatus.getPassengerCount());
            trainStatus.setPassengerCount(null);
        }

        if (trainStatus.getStatus() != null
                && trainStatus.getStatus() > ProtocolConstants.TRAIN_STATUS_OFFLINE) {
            log.warn("ValueRangeFilter: invalid status, trainId: {}, status: {}",
                    trainId, trainStatus.getStatus());
            trainStatus.setStatus(ProtocolConstants.TRAIN_STATUS_NORMAL);
        }

        return true;
    }
}
