package com.smartmeter.common.enums;

import com.smartmeter.common.constant.ProtocolConstants;

public enum ProtocolType {

    DLT645(ProtocolConstants.PROTOCOL_DLT645, "DL/T645电力仪表协议"),
    CJT188(ProtocolConstants.PROTOCOL_CJT188, "CJ/T188热量表协议");

    private final String code;
    private final String desc;

    ProtocolType(String code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    public String getCode() {
        return code;
    }

    public String getDesc() {
        return desc;
    }

    public static ProtocolType getByCode(String code) {
        for (ProtocolType type : values()) {
            if (type.code.equals(code)) {
                return type;
            }
        }
        return null;
    }
}
