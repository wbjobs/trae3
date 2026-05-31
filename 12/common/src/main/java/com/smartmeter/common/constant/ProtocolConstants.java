package com.smartmeter.common.constant;

public class ProtocolConstants {

    public static final String PROTOCOL_DLT645 = "DL/T645";
    public static final String PROTOCOL_CJT188 = "CJ/T188";

    public static final byte DLT645_START_FRAME = 0x68;
    public static final byte DLT645_END_FRAME = 0x16;
    public static final int DLT645_ADDR_LENGTH = 6;

    public static final byte CJT188_START_FRAME = 0x68;
    public static final byte CJT188_END_FRAME = 0x16;
    public static final int CJT188_ADDR_LENGTH = 7;

    public static final String CACHE_KEY_PREFIX = "meter:data:";
    public static final String CACHE_KEY_LATEST = CACHE_KEY_PREFIX + "latest:";
    public static final String CACHE_KEY_HISTORY = CACHE_KEY_PREFIX + "history:";
    public static final String CACHE_KEY_DEVICE = CACHE_KEY_PREFIX + "device:";
    public static final String CACHE_KEY_NULL_PLACEHOLDER = CACHE_KEY_PREFIX + "null:";
    public static final int CACHE_EXPIRE_SECONDS = 3600;
    public static final int CACHE_EXPIRE_DEVICE_SECONDS = 86400;
    public static final int CACHE_EXPIRE_NULL_SECONDS = 60;

    public static final String JWT_TOKEN_PREFIX = "Bearer ";
    public static final String JWT_CLAIM_USER_ID = "userId";
    public static final String JWT_CLAIM_ROLES = "roles";

    public static final String LOAD_BALANCER_STRATEGY_ROUND_ROBIN = "round_robin";
    public static final String LOAD_BALANCER_STRATEGY_WEIGHTED = "weighted";
    public static final String LOAD_BALANCER_STRATEGY_LEAST_CONN = "least_conn";

    public static final String FORWARD_STATUS_PENDING = "PENDING";
    public static final String FORWARD_STATUS_SUCCESS = "SUCCESS";
    public static final String FORWARD_STATUS_FAILED = "FAILED";

    public static final int RATE_LIMIT_PERMITS_PER_SECOND = 1000;
    public static final int RATE_LIMIT_WARMUP_SECONDS = 5;
    public static final int BATCH_UPLOAD_MAX_SIZE = 500;
}
