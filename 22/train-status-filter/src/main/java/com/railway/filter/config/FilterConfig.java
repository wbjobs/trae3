package com.railway.filter.config;

import com.railway.common.entity.TrainStatus;
import com.railway.filter.TrainStatusFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;

@Configuration
public class FilterConfig {

    private static final Logger log = LoggerFactory.getLogger(FilterConfig.class);

    @Bean(name = "trainStatusFilterChain")
    public Predicate<TrainStatus> trainStatusFilterChain(List<TrainStatusFilter> filters) {
        List<TrainStatusFilter> sortedFilters = new ArrayList<>(filters);
        sortedFilters.sort(Comparator.comparingInt(TrainStatusFilter::getOrder));

        log.info("Initialized train status filter chain with {} filters:", sortedFilters.size());
        for (TrainStatusFilter filter : sortedFilters) {
            log.info("  Filter: {}, order: {}", filter.getFilterName(), filter.getOrder());
        }

        return status -> {
            for (TrainStatusFilter filter : sortedFilters) {
                try {
                    boolean pass = filter.test(status);
                    if (!pass) {
                        log.debug("Filter [{}] rejected train status: {}",
                                filter.getFilterName(), status.getTrainId());
                        return false;
                    }
                } catch (Exception e) {
                    log.error("Filter [{}] error, trainId: {}",
                            filter.getFilterName(), status.getTrainId(), e);
                }
            }
            return true;
        };
    }
}
