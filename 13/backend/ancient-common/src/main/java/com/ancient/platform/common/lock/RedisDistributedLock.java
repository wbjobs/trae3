package com.ancient.platform.common.lock;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

@Slf4j
@Component
@RequiredArgsConstructor
public class RedisDistributedLock implements DistributedLock {

    private final RedissonClient redissonClient;

    @Value("${distributed-lock.lease-time:30}")
    private long defaultLeaseTime;

    @Value("${distributed-lock.wait-time:5}")
    private long defaultWaitTime;

    @Override
    public boolean tryLock(String lockKey, long waitTime, long leaseTime, TimeUnit timeUnit) throws InterruptedException {
        RLock lock = redissonClient.getLock(lockKey);
        boolean acquired = lock.tryLock(waitTime, leaseTime, timeUnit);
        if (acquired) {
            log.debug("获取分布式锁成功: {}", lockKey);
        } else {
            log.debug("获取分布式锁失败: {}", lockKey);
        }
        return acquired;
    }

    @Override
    public void unlock(String lockKey) {
        RLock lock = redissonClient.getLock(lockKey);
        if (lock.isHeldByCurrentThread()) {
            lock.unlock();
            log.debug("释放分布式锁成功: {}", lockKey);
        }
    }

    @Override
    public <T> T executeWithLock(String lockKey, long waitTime, long leaseTime, TimeUnit timeUnit, Supplier<T> supplier) {
        long actualWaitTime = waitTime > 0 ? waitTime : defaultWaitTime;
        long actualLeaseTime = leaseTime > 0 ? leaseTime : defaultLeaseTime;
        TimeUnit actualUnit = timeUnit != null ? timeUnit : TimeUnit.SECONDS;

        RLock lock = redissonClient.getLock(lockKey);
        try {
            boolean acquired = lock.tryLock(actualWaitTime, actualLeaseTime, actualUnit);
            if (!acquired) {
                throw new RuntimeException("获取分布式锁超时: " + lockKey);
            }
            log.debug("获取分布式锁成功: {}", lockKey);
            return supplier.get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("获取分布式锁被中断: " + lockKey, e);
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
                log.debug("释放分布式锁成功: {}", lockKey);
            }
        }
    }

    @Override
    public void executeWithLock(String lockKey, long waitTime, long leaseTime, TimeUnit timeUnit, Runnable runnable) {
        executeWithLock(lockKey, waitTime, leaseTime, timeUnit, () -> {
            runnable.run();
            return null;
        });
    }
}
