package com.railway.common.util;

import cn.hutool.core.util.IdUtil;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.concurrent.atomic.AtomicLong;

public final class IdGeneratorUtil {

    private static final String HOST_NAME;
    private static final AtomicLong SEQUENCE = new AtomicLong(0);

    static {
        String hostName;
        try {
            hostName = InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException e) {
            hostName = "unknown-host";
        }
        HOST_NAME = hostName;
    }

    private IdGeneratorUtil() {
    }

    public static String generateNodeId() {
        return HOST_NAME + "-" + System.getProperty("server.port", "8080");
    }

    public static String generateMessageId() {
        return IdUtil.getSnowflakeNextIdStr();
    }

    public static long generateSnowflakeId() {
        return IdUtil.getSnowflakeNextId();
    }

    public static String generateTraceId() {
        return "TRACE-" + IdUtil.getSnowflakeNextIdStr();
    }

    public static long generateSequence() {
        return SEQUENCE.incrementAndGet();
    }

    public static String generateDupKey(String trainId, long timestamp) {
        return trainId + ":" + timestamp;
    }

    public static String generateDupKey(String trainId, String protocolVersion, int sequence) {
        return trainId + ":" + protocolVersion + ":" + sequence;
    }
}
