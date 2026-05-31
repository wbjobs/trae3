package com.railway.filter;

import com.railway.common.entity.TrainStatus;

import java.util.function.Predicate;

public interface TrainStatusFilter extends Predicate<TrainStatus> {

    String getFilterName();

    default int getOrder() {
        return 0;
    }

    @Override
    boolean test(TrainStatus trainStatus);
}
