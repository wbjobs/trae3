package com.specimen.traceability.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("traceability_qrcode")
public class TraceabilityQrCode extends TenantEntity {
    private Long specimenId;
    private String qrCodeUrl;
    private String qrCodeContent;
    private Integer scanCount;
    private LocalDateTime lastScanTime;
    private LocalDateTime expireTime;
    private Integer status;
}
