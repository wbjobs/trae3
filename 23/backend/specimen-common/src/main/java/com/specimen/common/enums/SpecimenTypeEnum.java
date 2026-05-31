package com.specimen.common.enums;

import lombok.Getter;

@Getter
public enum SpecimenTypeEnum {
    BIOLOGY(1, "生物标本"),
    GEOLOGY(2, "地质标本"),
    PLANT(3, "植物标本"),
    ANIMAL(4, "动物标本"),
    FOSSIL(5, "化石标本"),
    MINERAL(6, "矿物标本"),
    OTHER(99, "其他");

    private final Integer code;
    private final String name;

    SpecimenTypeEnum(Integer code, String name) {
        this.code = code;
        this.name = name;
    }

    public static String getNameByCode(Integer code) {
        if (code == null) return null;
        for (SpecimenTypeEnum e : values()) {
            if (e.getCode().equals(code)) {
                return e.getName();
            }
        }
        return null;
    }
}
