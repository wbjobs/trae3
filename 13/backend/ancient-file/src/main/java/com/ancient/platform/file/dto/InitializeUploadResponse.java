package com.ancient.platform.file.dto;

import lombok.Data;

import java.util.List;

@Data
public class InitializeUploadResponse {

    private String fileId;

    private String uploadId;

    private Boolean exists;

    private List<Integer> uploadedChunks;
}
