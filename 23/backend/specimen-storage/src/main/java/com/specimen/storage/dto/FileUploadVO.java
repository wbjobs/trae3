package com.specimen.storage.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileUploadVO {
    private Long fileId;
    private String fileName;
    private String fileUrl;
    private Long fileSize;
    private String bucketName;
    private String objectName;
}
