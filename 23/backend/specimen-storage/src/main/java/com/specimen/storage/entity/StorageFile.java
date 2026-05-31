package com.specimen.storage.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("storage_file")
public class StorageFile extends TenantEntity {
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
}
