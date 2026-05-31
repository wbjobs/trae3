package com.ancient.platform.file.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("t_file_info")
public class FileInfo implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private Long projectId;

    private String fileName;

    private String originalName;

    private String fileType;

    private Long fileSize;

    private String storagePath;

    private String url;

    private String md5;

    private Long uploaderId;

    private LocalDateTime uploadTime;

    private Integer status;

    @TableLogic
    private Integer deleted;

    private String uploadId;

    private Long chunkSize;

    private Integer totalChunks;

    private String uploadedChunks;
}
