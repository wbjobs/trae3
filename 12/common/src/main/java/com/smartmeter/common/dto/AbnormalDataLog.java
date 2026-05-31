package com.smartmeter.common.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AbnormalDataLog implements Serializable {

    private static final long serialVersionUID = 1L;

    private String id;

    private String meterId;

    private String protocolType;

    private String rawData;

    private String errorType;

    private String errorMessage;

    private String source;

    private LocalDateTime occurTime;

    private String clientIp;

    private String userId;
}
