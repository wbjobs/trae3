package com.specimen.storage.dto;

import io.minio.messages.Part;
import lombok.Data;
import java.util.List;

@Data
public class MultipartUploadCompleteDTO {
    private String uploadId;
    private String originalName;
    private List<Part> parts;
}
