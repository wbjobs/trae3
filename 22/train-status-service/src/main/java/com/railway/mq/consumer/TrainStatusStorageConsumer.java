package com.railway.mq.consumer;

import com.railway.cluster.service.ClusterSyncService;
import com.railway.common.constant.MqConstants;
import com.railway.common.entity.TrainStatus;
import com.railway.common.util.CircuitBreaker;
import com.railway.common.util.IdGeneratorUtil;
import com.railway.service.TrainStatusService;
import org.apache.rocketmq.spring.annotation.ConsumeMode;
import org.apache.rocketmq.spring.annotation.MessageModel;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;

@Component
@RocketMQMessageListener(
        topic = MqConstants.TOPIC_TRAIN_STATUS_FILTERED,
        consumerGroup = MqConstants.CONSUMER_GROUP_TRAIN_STORAGE,
        selectorExpression = MqConstants.TAG_FILTERED_DATA,
        consumeMode = ConsumeMode.CONCURRENTLY,
        messageModel = MessageModel.CLUSTERING,
        consumeThreadMax = 16
)
public class TrainStatusStorageConsumer implements RocketMQListener<TrainStatus> {

    private static final Logger log = LoggerFactory.getLogger(TrainStatusStorageConsumer.class);
    private static final Logger backpressureLog = LoggerFactory.getLogger("BACKPRESSURE_LOGGER");

    private static final AtomicLong totalStored = new AtomicLong(0);
    private static final AtomicLong totalSkipped = new AtomicLong(0);
    private static final AtomicLong lastLogTime = new AtomicLong(System.currentTimeMillis());

    @Resource
    private TrainStatusService trainStatusService;

    @Resource
    private ClusterSyncService clusterSyncService;

    @Resource
    private CircuitBreaker mysqlCircuitBreaker;

    @Resource
    private CircuitBreaker redisCircuitBreaker;

    @Override
    public void onMessage(TrainStatus trainStatus) {
        if (trainStatus == null) {
            log.warn("Received null train status for storage, skip");
            return;
        }

        long count = totalStored.incrementAndGet();

        if (count % 1000 == 0) {
            long now = System.currentTimeMillis();
            long elapsed = now - lastLogTime.getAndSet(now);
            double qps = elapsed > 0 ? (1000.0 * 1000 / elapsed) : 0;
            log.info("Storage consumer stats - total: {}, skipped: {}, qps: {:.2f}",
                    count, totalSkipped.get(), qps);
        }

        try {
            if (trainStatus.getCreateTime() == null) {
                trainStatus.setCreateTime(LocalDateTime.now());
            }

            if (trainStatus.getNodeId() == null) {
                trainStatus.setNodeId(IdGeneratorUtil.generateNodeId());
            }

            if (mysqlCircuitBreaker.isOpen()) {
                backpressureLog.warn("MySQL circuit breaker is open, skipping storage, trainId: {}",
                        trainStatus.getTrainId());
                totalSkipped.incrementAndGet();
                syncToCacheOnly(trainStatus);
                return;
            }

            try {
                boolean success = trainStatusService.save(trainStatus);
                if (success) {
                    mysqlCircuitBreaker.recordSuccess();
                    log.debug("Stored train status success, trainId: {}, id: {}",
                            trainStatus.getTrainId(), trainStatus.getId());
                } else {
                    mysqlCircuitBreaker.recordFailure();
                    log.warn("Stored train status failed, trainId: {}", trainStatus.getTrainId());
                }
            } catch (Exception e) {
                mysqlCircuitBreaker.recordFailure();
                throw e;
            }

            if (!redisCircuitBreaker.isOpen()) {
                try {
                    clusterSyncService.syncTrainStatus(trainStatus);
                    redisCircuitBreaker.recordSuccess();
                } catch (Exception e) {
                    redisCircuitBreaker.recordFailure();
                    log.warn("Sync to cluster failed, but storage succeeded, trainId: {}",
                            trainStatus.getTrainId());
                }
            }

        } catch (Exception e) {
            log.error("Store train status failed, trainId: {}", trainStatus.getTrainId(), e);
            totalSkipped.incrementAndGet();
        }
    }

    private void syncToCacheOnly(TrainStatus trainStatus) {
        if (!redisCircuitBreaker.isOpen()) {
            try {
                clusterSyncService.syncTrainStatus(trainStatus);
                redisCircuitBreaker.recordSuccess();
            } catch (Exception e) {
                redisCircuitBreaker.recordFailure();
            }
        }
    }

    public static long getTotalStored() {
        return totalStored.get();
    }

    public static long getTotalSkipped() {
        return totalSkipped.get();
    }
}
