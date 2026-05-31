package com.railway.common.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    private final double permitsPerSecond;
    private final long maxPermits;
    private final AtomicLong storedPermits;
    private final AtomicLong lastRefillTime;
    private final long nanosPerPermit;

    public RateLimiter(double permitsPerSecond) {
        this(permitsPerSecond, (long) permitsPerSecond * 2);
    }

    public RateLimiter(double permitsPerSecond, long maxPermits) {
        this.permitsPerSecond = permitsPerSecond;
        this.maxPermits = maxPermits;
        this.storedPermits = new AtomicLong(maxPermits);
        this.lastRefillTime = new AtomicLong(System.nanoTime());
        this.nanosPerPermit = (long) (TimeUnit.SECONDS.toNanos(1) / permitsPerSecond);
    }

    public boolean tryAcquire() {
        return tryAcquire(1);
    }

    public boolean tryAcquire(int permits) {
        if (permits <= 0) {
            return true;
        }

        refillPermits();

        long current = storedPermits.get();
        long required = permits;

        while (current >= required) {
            if (storedPermits.compareAndSet(current, current - required)) {
                return true;
            }
            current = storedPermits.get();
        }

        return false;
    }

    public void acquire() throws InterruptedException {
        while (!tryAcquire()) {
            Thread.sleep(1);
        }
    }

    private void refillPermits() {
        long now = System.nanoTime();
        long lastTime = lastRefillTime.get();

        if (now - lastTime < nanosPerPermit) {
            return;
        }

        if (lastRefillTime.compareAndSet(lastTime, now)) {
            long permitsToAdd = (now - lastTime) / nanosPerPermit;
            storedPermits.updateAndGet(current -> Math.min(maxPermits, current + permitsToAdd));
        }
    }

    public double getPermitsPerSecond() {
        return permitsPerSecond;
    }

    public long getAvailablePermits() {
        refillPermits();
        return storedPermits.get();
    }

    public static class MultiRateLimiter {

        private final RateLimiter globalLimiter;
        private final java.util.concurrent.ConcurrentHashMap<String, RateLimiter> perIpLimiters;
        private final double perIpPermitsPerSecond;
        private final long maxIpLimiters;

        public MultiRateLimiter(double globalPermitsPerSecond, double perIpPermitsPerSecond) {
            this.globalLimiter = new RateLimiter(globalPermitsPerSecond);
            this.perIpLimiters = new java.util.concurrent.ConcurrentHashMap<>();
            this.perIpPermitsPerSecond = perIpPermitsPerSecond;
            this.maxIpLimiters = 10000;
        }

        public boolean tryAcquire(String ip) {
            if (!globalLimiter.tryAcquire()) {
                return false;
            }

            RateLimiter ipLimiter = perIpLimiters.computeIfAbsent(ip,
                    k -> new RateLimiter(perIpPermitsPerSecond));

            if (!ipLimiter.tryAcquire()) {
                return false;
            }

            if (perIpLimiters.size() > maxIpLimiters) {
                perIpLimiters.clear();
                log.warn("Per-IP rate limiter cache cleared due to size limit");
            }

            return true;
        }

        public long getGlobalAvailable() {
            return globalLimiter.getAvailablePermits();
        }

        public long getPerIpAvailable(String ip) {
            RateLimiter limiter = perIpLimiters.get(ip);
            return limiter != null ? limiter.getAvailablePermits() : (long) perIpPermitsPerSecond;
        }
    }
}
