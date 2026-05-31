package com.smartmeter.common.dto;

import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
public class MeterDataDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String meterId;

    private String protocolType;

    private String rawData;

    private LocalDateTime collectTime;

    private List<DataItem> dataItems;

    @Data
    public static class DataItem implements Serializable {
        private String dataType;
        private BigDecimal value;
        private String unit;
        private Map<String, Object> extra;
    }
}
