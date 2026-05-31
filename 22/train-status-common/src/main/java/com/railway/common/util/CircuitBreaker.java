package com.railway.common.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class CircuitBreaker {

    private static final Logger log = LoggerFactory.getLogger(CircuitBreaker.class);

    public enum State {
        CLOSED, OPEN, HALF_OPEN
    }

    private final String name;
    private final int failureThreshold;
    private final long timeoutMillis;
    private final int halfOpenSuccessThreshold;

    private volatile State state = State.CLOSED;
    private final AtomicInteger failureCount = new AtomicInteger(0);
    private final AtomicInteger successCount = new AtomicInteger(0);
    private final AtomicLong lastFailureTime = new AtomicLong(0);
    private final AtomicLong lastStateChangeTime = new AtomicLong(System.currentTimeMillis());

    public CircuitBreaker(String name, int failureThreshold, long timeoutMillis, int halfOpenSuccessThreshold) {
        this.name = name;
        this.failureThreshold = failureThreshold;
        this.timeoutMillis = timeoutMillis;
        this.halfOpenSuccessThreshold = halfOpenSuccessThreshold;
    }

    public boolean isOpen() {
        if (state == State.OPEN) {
            if (System.currentTimeMillis() - lastStateChangeTime.get() > timeoutMillis) {
                if (state == State.OPEN) {
                    state = State.HALF_OPEN;
                    successCount.set(0);
                    lastStateChangeTime.set(System.currentTimeMillis());
                    log.info("CircuitBreaker [{}] changed to HALF_OPEN", name);
                }
            }
        }
        return state == State.OPEN;
    }

    public void recordSuccess() {
        if (state == State.HALF_OPEN) {
            if (successCount.incrementAndGet() >= halfOpenSuccessThreshold) {
                state = State.CLOSED;
                failureCount.set(0);
                lastStateChangeTime.set(System.currentTimeMillis());
                log.info("CircuitBreaker [{}] changed to CLOSED", name);
            }
        } else if (state == State.CLOSED) {
            failureCount.set(0);
        }
    }

    public void recordFailure() {
        lastFailureTime.set(System.currentTimeMillis());
        if (state == State.HALF_OPEN) {
            state = State.OPEN;
            lastStateChangeTime.set(System.currentTimeMillis());
            log.warn("CircuitBreaker [{}] changed to OPEN (HALF_OPEN failure)", name);
        } else if (state == State.CLOSED) {
            int count = failureCount.incrementAndGet();
            if (count >= failureThreshold) {
                state = State.OPEN;
                lastStateChangeTime.set(System.currentTimeMillis());
                log.warn("CircuitBreaker [{}] changed to OPEN (threshold reached: {}/{})",
                        name, count, failureThreshold);
            }
        }
    }

    public State getState() {
        return state;
    }

    public int getFailureCount() {
        return failureCount.get();
    }

    public long getLastFailureTime() {
        return lastFailureTime.get();
    }

    public String getName() {
        return name;
    }

    public <T> T execute(SupplierWithException<T> supplier, T fallback) {
        if (isOpen()) {
            return fallback;
        }
        try {
            T result = supplier.get();
            recordSuccess();
            return result;
        } catch (Exception e) {
            recordFailure();
            log.error("CircuitBreaker [{}] execution failed", name, e);
            return fallback;
        }
    }

    @FunctionalInterface
    public interface SupplierWithException<T> {
        T get() throws Exception;
    }
}
