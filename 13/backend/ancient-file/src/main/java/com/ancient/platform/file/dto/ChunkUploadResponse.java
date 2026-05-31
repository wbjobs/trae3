package com.ancient.platform.file.dto;

import lombok.Data;

@Data
public class ChunkUploadResponse {

    private String fileId;

    private Integer chunkIndex;

    private Boolean uploaded;

    private Double progress;

    private String checksum;

    private Long uploadedChunks;

    private Long totalChunks;
}
