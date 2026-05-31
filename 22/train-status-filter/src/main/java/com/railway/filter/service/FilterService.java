package com.railway.filter.service;

import com.railway.common.entity.TrainStatus;
import com.railway.filter.TrainStatusFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.Resource;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Service
public class FilterService {

    private static final Logger log = LoggerFactory.getLogger(FilterService.class);
    private static final Logger filterLog = LoggerFactory.getLogger("FILTER_LOGGER");
    private static final Logger abnormalLog = LoggerFactory.getLogger("ABNORMAL_DATA_LOGGER");

    @Resource(name = "trainStatusFilterChain")
    private Predicate<TrainStatus> filterChain;

    @Resource
    private List<TrainStatusFilter> filters;

    public boolean filter(TrainStatus status) {
        if (status == null) {
            filterLog.warn("Filter rejected: trainStatus is null");
            return false;
        }

        String trainId = status.getTrainId();
        List<String> failedFilters = new ArrayList<>();

        for (TrainStatusFilter filter : getSortedFilters()) {
            try {
                boolean pass = filter.test(status);
                if (!pass) {
                    failedFilters.add(filter.getFilterName());
                    filterLog.warn("Filter [{}] rejected train status: {}", filter.getFilterName(), trainId);
                }
            } catch (Exception e) {
                log.error("Filter [{}] error, trainId: {}, pass by default",
                        filter.getFilterName(), trainId, e);
            }
        }

        if (!failedFilters.isEmpty()) {
            abnormalLog.warn("Abnormal data detected | trainId: {} | failedFilters: {} | " +
                            "status: {} | speed: {} | longitude: {} | latitude: {}",
                    trainId, failedFilters,
                    status.getStatus(), status.getSpeed(),
                    status.getLongitude(), status.getLatitude());
            return false;
        }

        filterLog.debug("All filters passed, trainId: {}", trainId);
        return true;
    }

    public List<String> getFilterNames() {
        return getSortedFilters().stream()
                .map(f -> f.getFilterName() + " (order: " + f.getOrder() + ")")
                .collect(Collectors.toList());
    }

    private List<TrainStatusFilter> getSortedFilters() {
        return filters.stream()
                .sorted(Comparator.comparingInt(TrainStatusFilter::getOrder))
                .collect(Collectors.toList());
    }
}
