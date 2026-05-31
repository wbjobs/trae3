package com.smartmeter.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("meter_data")
public class MeterData implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String meterId;

    private String protocolType;

    private String dataType;

    private BigDecimal value;

    private String unit;

    private LocalDateTime collectTime;

    private String rawData;

    private String parsedData;

    private String forwardStatus;

    private LocalDateTime forwardTime;

    private Integer retryCount;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
