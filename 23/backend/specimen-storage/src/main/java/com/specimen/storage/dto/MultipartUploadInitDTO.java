package com.specimen.storage.dto;

import lombok.Data;

@Data
public class MultipartUploadInitDTO {
    private String originalName;
    private Long fileSize;
    private Integer partCount;
}
