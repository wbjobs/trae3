package com.railway.filter.impl;

import com.railway.common.entity.TrainStatus;
import com.railway.filter.TrainStatusFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;

@Component
public class TimelinessFilter implements TrainStatusFilter {

    private static final Logger log = LoggerFactory.getLogger(TimelinessFilter.class);

    @Value("${train.filter.max-delay-minutes:30}")
    private int maxDelayMinutes;

    @Value("${train.filter.max-future-minutes:5}")
    private int maxFutureMinutes;

    @Override
    public String getFilterName() {
        return "TimelinessFilter";
    }

    @Override
    public int getOrder() {
        return 15;
    }

    @Override
    public boolean test(TrainStatus trainStatus) {
        if (trainStatus.getReportTime() == null) {
            return true;
        }

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime reportTime = trainStatus.getReportTime();

        Duration delay = Duration.between(reportTime, now);
        if (delay.toMinutes() > maxDelayMinutes) {
            log.warn("TimelinessFilter rejected: data too old, trainId: {}, delay: {} minutes",
                    trainStatus.getTrainId(), delay.toMinutes());
            return false;
        }

        Duration future = Duration.between(now, reportTime);
        if (future.toMinutes() > maxFutureMinutes) {
            log.warn("TimelinessFilter rejected: data from future, trainId: {}, future: {} minutes",
                    trainStatus.getTrainId(), future.toMinutes());
            return false;
        }

        return true;
    }
}
