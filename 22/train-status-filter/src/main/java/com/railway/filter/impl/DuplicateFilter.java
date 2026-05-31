package com.railway.filter.impl;

import com.railway.cluster.service.ClusterSyncService;
import com.railway.common.entity.TrainStatus;
import com.railway.filter.TrainStatusFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import jakarta.annotation.Resource;

@Component
public class DuplicateFilter implements TrainStatusFilter {

    private static final Logger log = LoggerFactory.getLogger(DuplicateFilter.class);

    @Resource
    private ClusterSyncService clusterSyncService;

    @Override
    public String getFilterName() {
        return "DuplicateFilter";
    }

    @Override
    public int getOrder() {
        return 20;
    }

    @Override
    public boolean test(TrainStatus trainStatus) {
        try {
            long timestamp = trainStatus.getReportTime() != null
                    ? trainStatus.getReportTime().atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                    : System.currentTimeMillis();

            boolean isDuplicate = clusterSyncService.isDuplicate(
                    trainStatus.getTrainId(), timestamp);

            if (isDuplicate) {
                log.warn("DuplicateFilter rejected: duplicate data, trainId: {}, timestamp: {}",
                        trainStatus.getTrainId(), timestamp);
                return false;
            }

            return true;
        } catch (Exception e) {
            log.warn("DuplicateFilter error, pass by default, trainId: {}",
                    trainStatus.getTrainId(), e);
            return true;
        }
    }
}
