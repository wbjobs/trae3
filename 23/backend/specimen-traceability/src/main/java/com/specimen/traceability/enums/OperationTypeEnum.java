package com.specimen.traceability.enums;

import lombok.Getter;

@Getter
public enum OperationTypeEnum {
    CREATE(1, "创建"),
    EDIT(2, "编辑"),
    ANNOTATE(3, "标注"),
    AUDIT(4, "审核"),
    BORROW(5, "借出"),
    RETURN(6, "归还"),
    DESTROY(7, "销毁");

    private final Integer code;
    private final String desc;

    OperationTypeEnum(Integer code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    public static OperationTypeEnum getByCode(Integer code) {
        for (OperationTypeEnum type : values()) {
            if (type.getCode().equals(code)) {
                return type;
            }
        }
        return null;
    }
}
