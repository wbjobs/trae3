package com.specimen.storage.service;

import io.minio.messages.Part;
import org.springframework.web.multipart.MultipartFile;
import java.io.InputStream;
import java.util.List;
import java.util.Map;

public interface MinioService {
    void createBucket(String bucketName);
    String upload(MultipartFile file);
    String upload(MultipartFile file, String path);
    String preview(String objectName, Integer expires);
    InputStream download(String objectName);
    void delete(String objectName);
    Map<String, Object> initMultipartUpload(String objectName, Integer partCount);
    String uploadPart(String objectName, String uploadId, Integer partNumber, MultipartFile file);
    String completeMultipartUpload(String objectName, String uploadId, List<Part> parts);
}
