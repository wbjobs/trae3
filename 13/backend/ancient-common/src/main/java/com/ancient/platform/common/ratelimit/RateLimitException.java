package com.ancient.platform.common.ratelimit;

public class RateLimitException extends RuntimeException {

    private final String key;
    private final int limit;
    private final int window;

    public RateLimitException(String message, String key, int limit, int window) {
        super(message);
        this.key = key;
        this.limit = limit;
        this.window = window;
    }

    public RateLimitException(String key, int limit, int window) {
        super("请求过于频繁，请稍后重试");
        this.key = key;
        this.limit = limit;
        this.window = window;
    }

    public String getKey() {
        return key;
    }

    public int getLimit() {
        return limit;
    }

    public int getWindow() {
        return window;
    }
}
