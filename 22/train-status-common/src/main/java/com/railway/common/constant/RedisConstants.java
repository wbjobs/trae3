package com.railway.common.constant;

public final class RedisConstants {

    private RedisConstants() {
    }

    public static final String KEY_PREFIX_TRAIN_STATUS = "train:status:";

    public static final String KEY_PREFIX_TRAIN_HEARTBEAT = "train:heartbeat:";

    public static final String KEY_PREFIX_NODE_STATUS = "cluster:node:";

    public static final String KEY_NODE_LIST = "cluster:nodes:list";

    public static final String KEY_PREFIX_AUTH_TOKEN = "auth:token:";

    public static final String KEY_PREFIX_DUPLICATE_CHECK = "train:dup:";

    public static final String CHANNEL_CLUSTER_SYNC = "cluster:sync:channel";

    public static final String CHANNEL_TRAIN_STATUS_NOTIFY = "train:status:notify";

    public static final long TTL_TRAIN_STATUS = 300;

    public static final long TTL_HEARTBEAT = 60;

    public static final long TTL_NODE_STATUS = 30;

    public static final long TTL_DUPLICATE_CHECK = 60;

    public static final long TTL_AUTH_TOKEN = 7200;
}
