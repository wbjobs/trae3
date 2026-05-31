package com.ancient.platform.file.dto;

import lombok.Data;

@Data
public class CompleteUploadResponse {

    private String fileId;

    private String url;

    private String fileName;
}
