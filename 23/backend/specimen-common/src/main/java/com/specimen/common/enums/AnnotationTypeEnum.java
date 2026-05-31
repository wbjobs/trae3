package com.specimen.common.enums;

import lombok.Getter;

@Getter
public enum AnnotationTypeEnum {
    RECTANGLE(1, "矩形框"),
    POLYGON(2, "多边形"),
    POINT(3, "点标记"),
    CIRCLE(4, "圆形"),
    LINE(5, "线条"),
    TEXT(6, "文字标注");

    private final Integer code;
    private final String name;

    AnnotationTypeEnum(Integer code, String name) {
        this.code = code;
        this.name = name;
    }
}
