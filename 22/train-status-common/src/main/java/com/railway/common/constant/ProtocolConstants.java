package com.railway.common.constant;

public final class ProtocolConstants {

    private ProtocolConstants() {
    }

    public static final byte PROTOCOL_HEADER = 0x5A;

    public static final byte PROTOCOL_TAIL = 0xA5;

    public static final int MIN_FRAME_LENGTH = 16;

    public static final int MAX_FRAME_LENGTH = 1024;

    public static final int VERSION_V1 = 0x01;

    public static final int VERSION_V2 = 0x02;

    public static final int MSG_TYPE_STATUS_REPORT = 0x10;

    public static final int MSG_TYPE_HEARTBEAT = 0x11;

    public static final int MSG_TYPE_ALERT = 0x12;

    public static final int MSG_TYPE_COMMAND_ACK = 0x20;

    public static final int TRAIN_STATUS_NORMAL = 0;

    public static final int TRAIN_STATUS_WARNING = 1;

    public static final int TRAIN_STATUS_FAULT = 2;

    public static final int TRAIN_STATUS_OFFLINE = 3;

    public static final int DEVICE_TYPE_CCU = 1;

    public static final int DEVICE_TYPE_TCU = 2;

    public static final int DEVICE_TYPE_BMS = 3;

    public static final int DEVICE_TYPE_PIS = 4;

    public static final int DEVICE_TYPE_ATP = 5;
}
