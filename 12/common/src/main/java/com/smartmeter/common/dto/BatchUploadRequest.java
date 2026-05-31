package com.smartmeter.common.dto;

import lombok.Data;
import java.io.Serializable;
import java.util.List;

@Data
public class BatchUploadRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    private String protocolType;

    private List<String> hexDataList;
}
