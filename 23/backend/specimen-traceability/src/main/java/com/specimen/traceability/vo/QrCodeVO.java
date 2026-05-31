package com.specimen.traceability.vo;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class QrCodeVO {
    private Long id;
    private Long specimenId;
    private String qrCodeUrl;
    private String qrCodeContent;
    private String qrCodeImageBase64;
    private Integer scanCount;
    private LocalDateTime lastScanTime;
    private LocalDateTime expireTime;
    private Integer status;
    private LocalDateTime createTime;
}
