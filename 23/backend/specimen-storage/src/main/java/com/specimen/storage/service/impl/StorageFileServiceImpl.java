package com.specimen.storage.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.common.context.TenantContext;
import com.specimen.common.exception.BusinessException;
import com.specimen.storage.config.MinioConfig;
import com.specimen.storage.dto.FileInfoVO;
import com.specimen.storage.dto.FileUploadVO;
import com.specimen.storage.entity.StorageFile;
import com.specimen.storage.mapper.StorageFileMapper;
import com.specimen.storage.service.MinioService;
import com.specimen.storage.service.StorageFileService;
import io.minio.messages.Part;
import lombok.RequiredArgsConstructor;
import org.apache.commons.io.FilenameUtils;
import org.springframework.beans.BeanUtils;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StorageFileServiceImpl implements StorageFileService {
    private final MinioService minioService;
    private final StorageFileMapper storageFileMapper;
    private final MinioConfig minioConfig;
    private final StringRedisTemplate redisTemplate;

    private static final String MULTIPART_UPLOAD_PREFIX = "multipart:upload:";

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FileUploadVO uploadFile(MultipartFile file) {
        String datePath = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        String objectName = minioService.upload(file, datePath);
        String fileUrl = minioService.preview(objectName, 3600);

        StorageFile storageFile = buildStorageFile(file, objectName);
        storageFileMapper.insert(storageFile);

        return FileUploadVO.builder()
                .fileId(storageFile.getId())
                .fileName(storageFile.getFileName())
                .fileUrl(fileUrl)
                .fileSize(storageFile.getFileSize())
                .bucketName(minioConfig.getBucketName())
                .objectName(objectName)
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<FileUploadVO> batchUpload(List<MultipartFile> files) {
        return files.stream()
                .map(this::uploadFile)
                .collect(Collectors.toList());
    }

    @Override
    public FileInfoVO getFileInfo(Long id) {
        StorageFile storageFile = storageFileMapper.selectById(id);
        if (storageFile == null) {
            throw new BusinessException("文件不存在");
        }
        FileInfoVO fileInfoVO = new FileInfoVO();
        BeanUtils.copyProperties(storageFile, fileInfoVO);
        return fileInfoVO;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteFile(Long id) {
        StorageFile storageFile = storageFileMapper.selectById(id);
        if (storageFile == null) {
            throw new BusinessException("文件不存在");
        }
        minioService.delete(storageFile.getObjectName());
        storageFileMapper.deleteById(id);
    }

    @Override
    public Page<FileInfoVO> fileList(Integer page, Integer size, String keyword) {
        Page<StorageFile> pageParam = new Page<>(page, size);
        LambdaQueryWrapper<StorageFile> wrapper = new LambdaQueryWrapper<>();
        if (keyword != null && !keyword.isEmpty()) {
            wrapper.like(StorageFile::getOriginalName, keyword)
                    .or().like(StorageFile::getFileName, keyword);
        }
        wrapper.orderByDesc(StorageFile::getCreateTime);
        Page<StorageFile> storageFilePage = storageFileMapper.selectPage(pageParam, wrapper);

        Page<FileInfoVO> result = new Page<>(storageFilePage.getCurrent(), storageFilePage.getSize(), storageFilePage.getTotal());
        result.setRecords(storageFilePage.getRecords().stream()
                .map(file -> {
                    FileInfoVO vo = new FileInfoVO();
                    BeanUtils.copyProperties(file, vo);
                    return vo;
                })
                .collect(Collectors.toList()));
        return result;
    }

    @Override
    public Map<String, Object> initMultipartUpload(String originalName, Long fileSize, Integer partCount) {
        String extension = FilenameUtils.getExtension(originalName);
        String datePath = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        String fileName = UUID.randomUUID().toString().replace("-", "") + "." + extension;
        String objectName = datePath + "/" + fileName;

        Map<String, Object> result = minioService.initMultipartUpload(objectName, partCount);
        String uploadId = (String) result.get("uploadId");

        Map<String, Object> uploadInfo = new HashMap<>();
        uploadInfo.put("uploadId", uploadId);
        uploadInfo.put("objectName", objectName);
        uploadInfo.put("originalName", originalName);
        uploadInfo.put("fileSize", fileSize);
        uploadInfo.put("partCount", partCount);
        uploadInfo.put("fileName", fileName);
        uploadInfo.put("createTime", System.currentTimeMillis());

        redisTemplate.opsForHash().putAll(MULTIPART_UPLOAD_PREFIX + uploadId, uploadInfo);
        redisTemplate.expire(MULTIPART_UPLOAD_PREFIX + uploadId, 24, TimeUnit.HOURS);

        return result;
    }

    @Override
    public Map<String, Object> uploadPart(String uploadId, Integer partNumber, MultipartFile file) {
        String key = MULTIPART_UPLOAD_PREFIX + uploadId;
        Map<Object, Object> uploadInfo = redisTemplate.opsForHash().entries(key);
        if (uploadInfo.isEmpty()) {
            throw new BusinessException("分片上传任务不存在或已过期");
        }

        String objectName = (String) uploadInfo.get("objectName");
        String fileUrl = minioService.uploadPart(objectName, uploadId, partNumber, file);

        Map<String, Object> partMd5 = new HashMap<>();
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(file.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            partMd5.put(partNumber.toString(), sb.toString());
        } catch (Exception e) {
            throw new BusinessException("计算MD5失败");
        }

        redisTemplate.opsForHash().putAll(key + ":parts", partMd5);

        Map<String, Object> result = new HashMap<>();
        result.put("partNumber", partNumber);
        result.put("uploadId", uploadId);
        result.put("fileUrl", fileUrl);
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FileUploadVO completeMultipartUpload(String uploadId, String originalName, List<Part> parts) {
        String key = MULTIPART_UPLOAD_PREFIX + uploadId;
        Map<Object, Object> uploadInfo = redisTemplate.opsForHash().entries(key);
        if (uploadInfo.isEmpty()) {
            throw new BusinessException("分片上传任务不存在或已过期");
        }

        String objectName = (String) uploadInfo.get("objectName");
        String fileUrl = minioService.completeMultipartUpload(objectName, uploadId, parts);

        StorageFile storageFile = new StorageFile();
        storageFile.setTenantId(TenantContext.getTenantId());
        storageFile.setFileName(objectName.substring(objectName.lastIndexOf("/") + 1));
        storageFile.setOriginalName(originalName);
        storageFile.setFilePath(objectName);
        storageFile.setFileSize(Long.parseLong(uploadInfo.get("fileSize").toString()));
        storageFile.setFileType(FilenameUtils.getExtension(originalName));
        storageFile.setBucketName(minioConfig.getBucketName());
        storageFile.setObjectName(objectName);
        storageFile.setUploaderId(TenantContext.getUserId());
        storageFile.setUploaderName(TenantContext.getUsername());
        storageFile.setStatus(1);
        storageFileMapper.insert(storageFile);

        redisTemplate.delete(key);
        redisTemplate.delete(key + ":parts");

        return FileUploadVO.builder()
                .fileId(storageFile.getId())
                .fileName(storageFile.getFileName())
                .fileUrl(fileUrl)
                .fileSize(storageFile.getFileSize())
                .bucketName(minioConfig.getBucketName())
                .objectName(objectName)
                .build();
    }

    private StorageFile buildStorageFile(MultipartFile file, String objectName) {
        StorageFile storageFile = new StorageFile();
        storageFile.setTenantId(TenantContext.getTenantId());
        storageFile.setFileName(objectName.substring(objectName.lastIndexOf("/") + 1));
        storageFile.setOriginalName(file.getOriginalFilename());
        storageFile.setFilePath(objectName);
        storageFile.setFileSize(file.getSize());
        storageFile.setFileType(FilenameUtils.getExtension(file.getOriginalFilename()));
        storageFile.setContentType(file.getContentType());
        storageFile.setBucketName(minioConfig.getBucketName());
        storageFile.setObjectName(objectName);
        storageFile.setUploaderId(TenantContext.getUserId());
        storageFile.setUploaderName(TenantContext.getUsername());
        storageFile.setStatus(1);

        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(file.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            storageFile.setMd5(sb.toString());
        } catch (Exception e) {
            storageFile.setMd5("");
        }

        return storageFile;
    }
}
