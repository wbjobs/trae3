package com.ancient.platform.common.file;

import com.ancient.platform.common.config.MinioConfig;
import com.ancient.platform.common.exception.BusinessException;
import io.minio.*;
import io.minio.errors.*;
import io.minio.http.Method;
import io.minio.messages.DeleteError;
import io.minio.messages.DeleteObject;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * MinIO文件存储工具类
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MinioUtils {

    private final MinioClient minioClient;
    private final MinioConfig minioConfig;

    public boolean bucketExists(String bucketName) {
        try {
            return minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
        } catch (Exception e) {
            log.error("检查存储桶是否存在失败: {}", e.getMessage());
            throw new BusinessException("检查存储桶失败");
        }
    }

    public void makeBucket(String bucketName) {
        try {
            if (!bucketExists(bucketName)) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
            }
        } catch (Exception e) {
            log.error("创建存储桶失败: {}", e.getMessage());
            throw new BusinessException("创建存储桶失败");
        }
    }

    public String uploadFile(String objectName, MultipartFile file) {
        return uploadFile(minioConfig.getBucketName(), objectName, file);
    }

    public String uploadFile(String bucketName, String objectName, MultipartFile file) {
        try {
            makeBucket(bucketName);
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(file.getContentType())
                            .build()
            );
            return getFileUrl(bucketName, objectName);
        } catch (Exception e) {
            log.error("上传文件失败: {}", e.getMessage());
            throw new BusinessException("上传文件失败");
        }
    }

    public String uploadFile(String objectName, InputStream inputStream, long size, String contentType) {
        return uploadFile(minioConfig.getBucketName(), objectName, inputStream, size, contentType);
    }

    public String uploadFile(String bucketName, String objectName, InputStream inputStream, long size, String contentType) {
        try {
            makeBucket(bucketName);
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .stream(inputStream, size, -1)
                            .contentType(contentType)
                            .build()
            );
            return getFileUrl(bucketName, objectName);
        } catch (Exception e) {
            log.error("上传文件失败: {}", e.getMessage());
            throw new BusinessException("上传文件失败");
        }
    }

    public void uploadPart(String objectName, InputStream inputStream, long size, String uploadId, int partNumber) {
        uploadPart(minioConfig.getBucketName(), objectName, inputStream, size, uploadId, partNumber);
    }

    public void uploadPart(String bucketName, String objectName, InputStream inputStream, long size, String uploadId, int partNumber) {
        try {
            minioClient.uploadPart(
                    UploadPartArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .stream(inputStream, size, -1)
                            .uploadId(uploadId)
                            .partNumber(partNumber)
                            .build()
            );
        } catch (Exception e) {
            log.error("上传分片失败: {}", e.getMessage());
            throw new BusinessException("上传分片失败");
        }
    }

    public String createMultipartUpload(String objectName, String contentType) {
        return createMultipartUpload(minioConfig.getBucketName(), objectName, contentType);
    }

    public String createMultipartUpload(String bucketName, String objectName, String contentType) {
        try {
            makeBucket(bucketName);
            return minioClient.createMultipartUpload(
                    CreateMultipartUploadArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .contentType(contentType)
                            .build()
            );
        } catch (Exception e) {
            log.error("初始化分片上传失败: {}", e.getMessage());
            throw new BusinessException("初始化分片上传失败");
        }
    }

    public void completeMultipartUpload(String objectName, String uploadId, List<Part> parts) {
        completeMultipartUpload(minioConfig.getBucketName(), objectName, uploadId, parts);
    }

    public void completeMultipartUpload(String bucketName, String objectName, String uploadId, List<Part> parts) {
        try {
            minioClient.completeMultipartUpload(
                    CompleteMultipartUploadArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .uploadId(uploadId)
                            .parts(parts)
                            .build()
            );
        } catch (Exception e) {
            log.error("合并分片失败: {}", e.getMessage());
            throw new BusinessException("合并分片失败");
        }
    }

    public InputStream downloadFile(String objectName) {
        return downloadFile(minioConfig.getBucketName(), objectName);
    }

    public InputStream downloadFile(String bucketName, String objectName) {
        try {
            return minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .build()
            );
        } catch (Exception e) {
            log.error("下载文件失败: {}", e.getMessage());
            throw new BusinessException("下载文件失败");
        }
    }

    public void deleteFile(String objectName) {
        deleteFile(minioConfig.getBucketName(), objectName);
    }

    public void deleteFile(String bucketName, String objectName) {
        try {
            minioClient.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .build()
            );
        } catch (Exception e) {
            log.error("删除文件失败: {}", e.getMessage());
            throw new BusinessException("删除文件失败");
        }
    }

    public void deleteFiles(List<String> objectNames) {
        deleteFiles(minioConfig.getBucketName(), objectNames);
    }

    public void deleteFiles(String bucketName, List<String> objectNames) {
        try {
            List<DeleteObject> objects = new ArrayList<>();
            for (String objectName : objectNames) {
                objects.add(new DeleteObject(objectName));
            }
            Iterable<Result<DeleteError>> results = minioClient.removeObjects(
                    RemoveObjectsArgs.builder()
                            .bucket(bucketName)
                            .objects(objects)
                            .build()
            );
            for (Result<DeleteError> result : results) {
                DeleteError error = result.get();
                log.error("批量删除文件失败: {} - {}", error.objectName(), error.message());
            }
        } catch (Exception e) {
            log.error("批量删除文件失败: {}", e.getMessage());
            throw new BusinessException("批量删除文件失败");
        }
    }

    public String getFileUrl(String objectName) {
        return getFileUrl(minioConfig.getBucketName(), objectName);
    }

    public String getFileUrl(String bucketName, String objectName) {
        try {
            return minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(objectName)
                            .expiry(minioConfig.getPreviewExpiry(), TimeUnit.SECONDS)
                            .build()
            );
        } catch (Exception e) {
            log.error("获取文件URL失败: {}", e.getMessage());
            throw new BusinessException("获取文件URL失败");
        }
    }

    public String getPreviewUrl(String objectName) {
        return getFileUrl(objectName);
    }

    public String getUploadUrl(String objectName, int expirySeconds) {
        return getUploadUrl(minioConfig.getBucketName(), objectName, expirySeconds);
    }

    public String getUploadUrl(String bucketName, String objectName, int expirySeconds) {
        try {
            return minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucketName)
                            .object(objectName)
                            .expiry(expirySeconds, TimeUnit.SECONDS)
                            .build()
            );
        } catch (Exception e) {
            log.error("获取上传URL失败: {}", e.getMessage());
            throw new BusinessException("获取上传URL失败");
        }
    }

    public boolean fileExists(String objectName) {
        return fileExists(minioConfig.getBucketName(), objectName);
    }

    public boolean fileExists(String bucketName, String objectName) {
        try {
            minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .build()
            );
            return true;
        } catch (ErrorResponseException e) {
            if (e.response().code() == 404) {
                return false;
            }
            log.error("检查文件是否存在失败: {}", e.getMessage());
            throw new BusinessException("检查文件失败");
        } catch (Exception e) {
            log.error("检查文件是否存在失败: {}", e.getMessage());
            throw new BusinessException("检查文件失败");
        }
    }

    public List<Item> listFiles(String prefix) {
        return listFiles(minioConfig.getBucketName(), prefix);
    }

    public List<Item> listFiles(String bucketName, String prefix) {
        List<Item> items = new ArrayList<>();
        try {
            Iterable<Result<Item>> results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(bucketName)
                            .prefix(prefix)
                            .recursive(true)
                            .build()
            );
            for (Result<Item> result : results) {
                items.add(result.get());
            }
        } catch (Exception e) {
            log.error("列出文件失败: {}", e.getMessage());
            throw new BusinessException("列出文件失败");
        }
        return items;
    }

    public StatObjectResponse getFileInfo(String objectName) {
        return getFileInfo(minioConfig.getBucketName(), objectName);
    }

    public StatObjectResponse getFileInfo(String bucketName, String objectName) {
        try {
            return minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .build()
            );
        } catch (Exception e) {
            log.error("获取文件信息失败: {}", e.getMessage());
            throw new BusinessException("获取文件信息失败");
        }
    }

    public void copyFile(String sourceObjectName, String targetObjectName) {
        copyFile(minioConfig.getBucketName(), sourceObjectName, minioConfig.getBucketName(), targetObjectName);
    }

    public void copyFile(String sourceBucket, String sourceObjectName, String targetBucket, String targetObjectName) {
        try {
            minioClient.copyObject(
                    CopyObjectArgs.builder()
                            .bucket(targetBucket)
                            .object(targetObjectName)
                            .source(CopySource.builder().bucket(sourceBucket).object(sourceObjectName).build())
                            .build()
            );
        } catch (Exception e) {
            log.error("复制文件失败: {}", e.getMessage());
            throw new BusinessException("复制文件失败");
        }
    }
}
