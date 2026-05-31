package com.smartmeter.common.dto;

import lombok.Data;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class ForwardDataDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String batchId;

    private String source;

    private LocalDateTime timestamp;

    private List<MeterDataDTO> dataList;

    private String signature;
}
