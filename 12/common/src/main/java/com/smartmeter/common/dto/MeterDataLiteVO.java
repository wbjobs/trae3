package com.smartmeter.common.dto;

import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class MeterDataLiteVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String mid;

    private String pt;

    private Long ct;

    private java.util.List<ItemLite> items;

    @Data
    public static class ItemLite implements Serializable {
        private String dt;
        private BigDecimal v;
        private String u;
    }
}
