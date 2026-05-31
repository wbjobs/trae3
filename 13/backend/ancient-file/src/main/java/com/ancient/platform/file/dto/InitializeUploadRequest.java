package com.ancient.platform.file.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class InitializeUploadRequest {

    @NotBlank(message = "文件名不能为空")
    private String fileName;

    @NotNull(message = "文件大小不能为空")
    private Long fileSize;

    @NotBlank(message = "文件类型不能为空")
    private String fileType;

    @NotNull(message = "分片大小不能为空")
    private Long chunkSize;

    @NotNull(message = "项目ID不能为空")
    private Long projectId;
}
