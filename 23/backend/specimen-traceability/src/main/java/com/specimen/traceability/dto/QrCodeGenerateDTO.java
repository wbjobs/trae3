package com.specimen.traceability.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class QrCodeGenerateDTO {
    private Long specimenId;
    private Integer width = 300;
    private Integer height = 300;
    private String format = "PNG";
    private LocalDateTime expireTime;
}
