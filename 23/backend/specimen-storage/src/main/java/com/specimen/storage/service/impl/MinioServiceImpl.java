package com.specimen.storage.service.impl;

import com.specimen.common.exception.BusinessException;
import com.specimen.storage.config.MinioConfig;
import com.specimen.storage.service.MinioService;
import io.minio.*;
import io.minio.messages.Part;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.apache.commons.io.FilenameUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.InputStream;
import java.time.ZonedDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class MinioServiceImpl implements MinioService {
    private final MinioClient minioClient;
    private final MinioConfig minioConfig;

    @Override
    @SneakyThrows
    public void createBucket(String bucketName) {
        boolean found = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
        if (!found) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
        }
    }

    @Override
    public String upload(MultipartFile file) {
        return upload(file, "");
    }

    @Override
    @SneakyThrows
    public String upload(MultipartFile file, String path) {
        String originalFilename = file.getOriginalFilename();
        String extension = FilenameUtils.getExtension(originalFilename);
        String fileName = UUID.randomUUID().toString().replace("-", "") + "." + extension;
        String objectName = path.isEmpty() ? fileName : path + "/" + fileName;

        createBucket(minioConfig.getBucketName());

        minioClient.putObject(PutObjectArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .stream(file.getInputStream(), file.getSize(), -1)
                .contentType(file.getContentType())
                .build());

        return objectName;
    }

    @Override
    @SneakyThrows
    public String preview(String objectName, Integer expires) {
        int expiry = (expires == null || expires <= 0) ? 3600 : expires;
        return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .method(Method.GET)
                .expiry(expiry)
                .build());
    }

    @Override
    @SneakyThrows
    public InputStream download(String objectName) {
        return minioClient.getObject(GetObjectArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .build());
    }

    @Override
    @SneakyThrows
    public void delete(String objectName) {
        minioClient.removeObject(RemoveObjectArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .build());
    }

    @Override
    @SneakyThrows
    public Map<String, Object> initMultipartUpload(String objectName, Integer partCount) {
        createBucket(minioConfig.getBucketName());

        String uploadId = minioClient.initMultipartUpload(InitMultipartUploadArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .build()).result().uploadId();

        Map<String, Object> result = new HashMap<>();
        result.put("uploadId", uploadId);
        result.put("objectName", objectName);
        result.put("partCount", partCount);

        List<Map<String, Object>> parts = new ArrayList<>();
        for (int i = 1; i <= partCount; i++) {
            Map<String, Object> partInfo = new HashMap<>();
            partInfo.put("partNumber", i);
            partInfo.put("uploadUrl", minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .bucket(minioConfig.getBucketName())
                    .object(objectName)
                    .method(Method.PUT)
                    .expiry(3600 * 24)
                    .extraQueryParams(Map.of("uploadId", uploadId, "partNumber", String.valueOf(i)))
                    .build()));
            parts.add(partInfo);
        }
        result.put("parts", parts);

        return result;
    }

    @Override
    @SneakyThrows
    public String uploadPart(String objectName, String uploadId, Integer partNumber, MultipartFile file) {
        minioClient.uploadPart(UploadPartArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .uploadId(uploadId)
                .partNumber(partNumber)
                .stream(file.getInputStream(), file.getSize(), -1)
                .build());

        return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .method(Method.GET)
                .expiry(3600)
                .build());
    }

    @Override
    @SneakyThrows
    public String completeMultipartUpload(String objectName, String uploadId, List<Part> parts) {
        Part[] partArray = parts.toArray(new Part[0]);
        minioClient.completeMultipartUpload(CompleteMultipartUploadArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .uploadId(uploadId)
                .parts(partArray)
                .build());

        return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(objectName)
                .method(Method.GET)
                .expiry(3600)
                .build());
    }
}
