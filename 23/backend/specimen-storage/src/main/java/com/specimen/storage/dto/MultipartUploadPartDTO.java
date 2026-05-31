package com.specimen.storage.dto;

import lombok.Data;

@Data
public class MultipartUploadPartDTO {
    private String uploadId;
    private Integer partNumber;
}
