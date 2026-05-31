package com.specimen.common.enums;

import lombok.Getter;

@Getter
public enum StorageTypeEnum {
    IMAGE(1, "影像文件"),
    VIDEO(2, "视频文件"),
    DOCUMENT(3, "文档文件"),
    OTHER(99, "其他文件");

    private final Integer code;
    private final String name;

    StorageTypeEnum(Integer code, String name) {
        this.code = code;
        this.name = name;
    }
}
