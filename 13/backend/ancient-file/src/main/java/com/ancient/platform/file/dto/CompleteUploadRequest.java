package com.ancient.platform.file.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CompleteUploadRequest {

    @NotBlank(message = "文件ID不能为空")
    private String fileId;
}
