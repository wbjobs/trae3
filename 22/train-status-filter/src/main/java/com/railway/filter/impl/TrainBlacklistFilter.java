package com.railway.filter.impl;

import com.railway.common.entity.TrainStatus;
import com.railway.filter.TrainStatusFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TrainBlacklistFilter implements TrainStatusFilter {

    private static final Logger log = LoggerFactory.getLogger(TrainBlacklistFilter.class);

    @Value("${train.filter.blacklist:}")
    private String blacklistConfig;

    private final Set<String> blacklist = Collections.newSetFromMap(new ConcurrentHashMap<>());

    private volatile long lastRefreshTime = 0;

    @Override
    public String getFilterName() {
        return "TrainBlacklistFilter";
    }

    @Override
    public int getOrder() {
        return 5;
    }

    @Override
    public boolean test(TrainStatus trainStatus) {
        refreshBlacklist();

        String trainId = trainStatus.getTrainId();
        if (blacklist.contains(trainId)) {
            log.warn("TrainBlacklistFilter rejected: train is in blacklist, trainId: {}", trainId);
            return false;
        }

        return true;
    }

    private void refreshBlacklist() {
        long now = System.currentTimeMillis();
        if (now - lastRefreshTime < 60000) {
            return;
        }

        synchronized (this) {
            if (now - lastRefreshTime < 60000) {
                return;
            }

            blacklist.clear();
            if (blacklistConfig != null && !blacklistConfig.trim().isEmpty()) {
                String[] ids = blacklistConfig.split(",");
                for (String id : ids) {
                    String trimmed = id.trim();
                    if (!trimmed.isEmpty()) {
                        blacklist.add(trimmed);
                    }
                }
            }

            lastRefreshTime = now;
            log.info("TrainBlacklistFilter refreshed, blacklist size: {}", blacklist.size());
        }
    }

    public void addToBlacklist(String trainId) {
        if (trainId != null && !trainId.trim().isEmpty()) {
            blacklist.add(trainId.trim());
            log.info("Added to blacklist: {}", trainId);
        }
    }

    public void removeFromBlacklist(String trainId) {
        if (trainId != null && !trainId.trim().isEmpty()) {
            blacklist.remove(trainId.trim());
            log.info("Removed from blacklist: {}", trainId);
        }
    }

    public Set<String> getBlacklist() {
        return Collections.unmodifiableSet(blacklist);
    }
}
