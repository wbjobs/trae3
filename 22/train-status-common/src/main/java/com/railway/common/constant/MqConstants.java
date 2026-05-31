package com.railway.common.constant;

public final class MqConstants {

    private MqConstants() {
    }

    public static final String TOPIC_TRAIN_STATUS_REPORT = "TRAIN_STATUS_REPORT_TOPIC";

    public static final String TOPIC_TRAIN_STATUS_PARSED = "TRAIN_STATUS_PARSED_TOPIC";

    public static final String TOPIC_TRAIN_STATUS_FILTERED = "TRAIN_STATUS_FILTERED_TOPIC";

    public static final String TOPIC_TRAIN_STATUS_DEAD = "TRAIN_STATUS_DEAD_TOPIC";

    public static final String TOPIC_CLUSTER_SYNC = "CLUSTER_SYNC_TOPIC";

    public static final String CONSUMER_GROUP_TRAIN_PARSE = "TRAIN_PARSE_CONSUMER_GROUP";

    public static final String CONSUMER_GROUP_TRAIN_FILTER = "TRAIN_FILTER_CONSUMER_GROUP";

    public static final String CONSUMER_GROUP_TRAIN_STORAGE = "TRAIN_STORAGE_CONSUMER_GROUP";

    public static final String CONSUMER_GROUP_CLUSTER_SYNC = "CLUSTER_SYNC_CONSUMER_GROUP";

    public static final String TAG_RAW_DATA = "RAW";

    public static final String TAG_PARSED_DATA = "PARSED";

    public static final String TAG_FILTERED_DATA = "FILTERED";

    public static final String TAG_ERROR_DATA = "ERROR";

    public static final String TAG_NODE_HEARTBEAT = "HEARTBEAT";

    public static final String TAG_STATE_SYNC = "STATE_SYNC";
}
