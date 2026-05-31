package com.ancient.platform.file.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ChunkUploadRequest {

    @NotBlank(message = "文件ID不能为空")
    private String fileId;

    @NotNull(message = "分片索引不能为空")
    private Integer chunkIndex;

    @NotNull(message = "总分片数不能为空")
    private Integer totalChunks;

    @NotNull(message = "分片大小不能为空")
    private Long chunkSize;

    private Long totalSize;

    private String fileName;

    private String fileType;
}
