package com.smartmeter.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("meter_device")
public class MeterDevice implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String meterId;

    private String protocolType;

    private String deviceType;

    private String manufacturer;

    private String model;

    private String installLocation;

    private Integer status;

    private LocalDateTime lastOnlineTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
