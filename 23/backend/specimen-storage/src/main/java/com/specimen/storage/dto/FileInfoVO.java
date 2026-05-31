package com.specimen.storage.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class FileInfoVO {
    private Long id;
    private Long tenantId;
    private String fileName;
    private String originalName;
    private String filePath;
    private Long fileSize;
    private String fileType;
    private String contentType;
    private String bucketName;
    private String objectName;
    private String md5;
    private Long uploaderId;
    private String uploaderName;
    private Integer status;
    private Long createBy;
    private LocalDateTime createTime;
    private Long updateBy;
    private LocalDateTime updateTime;
}
