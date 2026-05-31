package com.specimen.traceability.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ScanRecordDTO {
    private Long qrCodeId;
    private String scannerIp;
    private String scannerUserAgent;
    private LocalDateTime scanTime;
}
