package com.ancient.platform.file.service;

import cn.hutool.core.util.StrUtil;
import com.ancient.platform.common.config.MinioConfig;
import com.ancient.platform.common.context.UserContextHolder;
import com.ancient.platform.common.exception.BusinessException;
import com.ancient.platform.common.file.MinioUtils;
import com.ancient.platform.file.dto.*;
import com.ancient.platform.file.entity.FileInfo;
import com.ancient.platform.file.mapper.FileInfoMapper;
import com.ancient.platform.file.service.ImageCompressionService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import io.minio.ComposeSource;
import io.minio.MinioClient;
import io.minio.ComposeObjectArgs;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileStorageService {

    private final FileInfoMapper fileInfoMapper;
    private final MinioUtils minioUtils;
    private final MinioClient minioClient;
    private final MinioConfig minioConfig;
    private final ImageCompressionService imageCompressionService;

    public InitializeUploadResponse initializeUpload(InitializeUploadRequest request) {
        String storagePath = buildStoragePath(request.getProjectId(), request.getFileName());
        boolean exists = minioUtils.fileExists(storagePath);
        if (exists) {
            FileInfo existing = getFileInfoByStoragePath(storagePath);
            if (existing != null && existing.getStatus() == 1) {
                InitializeUploadResponse response = new InitializeUploadResponse();
                response.setFileId(existing.getId());
                response.setExists(true);
                response.setUploadedChunks(List.of());
                return response;
            }
        }

        String uploadId = minioUtils.createMultipartUpload(storagePath, request.getFileType());

        FileInfo fileInfo = new FileInfo();
        fileInfo.setProjectId(request.getProjectId());
        fileInfo.setFileName(request.getFileName());
        fileInfo.setOriginalName(request.getFileName());
        fileInfo.setFileType(request.getFileType());
        fileInfo.setFileSize(request.getFileSize());
        fileInfo.setStoragePath(storagePath);
        fileInfo.setUploaderId(UserContextHolder.getUserId());
        fileInfo.setUploadTime(LocalDateTime.now());
        fileInfo.setStatus(0);
        fileInfo.setDeleted(0);
        fileInfo.setUploadId(uploadId);
        fileInfo.setChunkSize(request.getChunkSize());
        fileInfo.setTotalChunks((int) Math.ceil((double) request.getFileSize() / request.getChunkSize()));
        fileInfo.setUploadedChunks("");

        fileInfoMapper.insert(fileInfo);

        InitializeUploadResponse response = new InitializeUploadResponse();
        response.setFileId(fileInfo.getId());
        response.setUploadId(uploadId);
        response.setExists(false);
        response.setUploadedChunks(List.of());
        return response;
    }

    public ChunkUploadResponse uploadChunk(ChunkUploadRequest request, MultipartFile chunk) {
        FileInfo fileInfo = fileInfoMapper.selectById(request.getFileId());
        if (fileInfo == null) {
            throw new BusinessException("文件记录不存在");
        }

        String chunkPath = buildChunkPath(request.getFileId(), request.getChunkIndex());
        String checksum = minioUtils.uploadFile(chunkPath, chunk);

        String uploadedChunks = fileInfo.getUploadedChunks();
        if (StrUtil.isBlank(uploadedChunks)) {
            uploadedChunks = String.valueOf(request.getChunkIndex());
        } else {
            uploadedChunks = uploadedChunks + "," + request.getChunkIndex();
        }

        fileInfoMapper.update(null, new LambdaUpdateWrapper<FileInfo>()
                .eq(FileInfo::getId, request.getFileId())
                .set(FileInfo::getUploadedChunks, uploadedChunks));

        int uploadedCount = uploadedChunks.split(",").length;
        double progress = (double) uploadedCount / fileInfo.getTotalChunks() * 100;

        log.info("分片上传成功: fileId={}, chunkIndex={}, progress={}%",
                request.getFileId(), request.getChunkIndex(), String.format("%.2f", progress));

        ChunkUploadResponse response = new ChunkUploadResponse();
        response.setFileId(request.getFileId());
        response.setChunkIndex(request.getChunkIndex());
        response.setUploaded(true);
        response.setProgress(progress);
        response.setChecksum(checksum);
        response.setUploadedChunks((long) uploadedCount);
        response.setTotalChunks((long) fileInfo.getTotalChunks());

        return response;
    }

    public CompleteUploadResponse completeUpload(CompleteUploadRequest request) {
        FileInfo fileInfo = fileInfoMapper.selectById(request.getFileId());
        if (fileInfo == null) {
            throw new BusinessException("文件记录不存在");
        }

        int totalChunks = fileInfo.getTotalChunks();
        List<Integer> uploadedIndices = parseUploadedChunks(fileInfo.getUploadedChunks());
        if (uploadedIndices.size() < totalChunks) {
            throw new BusinessException("尚有分片未上传完成");
        }

        String bucketName = minioConfig.getBucketName();
        try {
            List<ComposeSource> sources = new ArrayList<>();
            for (int i = 0; i < totalChunks; i++) {
                String chunkPath = buildChunkPath(fileInfo.getId(), i);
                sources.add(ComposeSource.builder()
                        .bucket(bucketName)
                        .object(chunkPath)
                        .build());
            }

            String finalPath = fileInfo.getStoragePath();
            minioClient.composeObject(ComposeObjectArgs.builder()
                    .bucket(bucketName)
                    .object(finalPath)
                    .sources(sources)
                    .build());

            for (int i = 0; i < totalChunks; i++) {
                String chunkPath = buildChunkPath(fileInfo.getId(), i);
                minioUtils.deleteFile(chunkPath);
            }

            String url = minioUtils.getFileUrl(finalPath);

            fileInfoMapper.update(null, new LambdaUpdateWrapper<FileInfo>()
                    .eq(FileInfo::getId, request.getFileId())
                    .set(FileInfo::getStatus, 1)
                    .set(FileInfo::getUrl, url)
                    .set(FileInfo::getUploadId, null)
                    .set(FileInfo::getUploadedChunks, null));

            fileInfo.setStatus(1);
            fileInfo.setUrl(url);
            try {
                imageCompressionService.autoProcessImage(fileInfo);
            } catch (Exception e) {
                log.warn("自动处理图片失败: fileId={}, error={}", fileInfo.getId(), e.getMessage());
            }

            CompleteUploadResponse response = new CompleteUploadResponse();
            response.setFileId(fileInfo.getId());
            response.setUrl(url);
            response.setFileName(fileInfo.getOriginalName());
            return response;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("合并分片失败: {}", e.getMessage());
            throw new BusinessException("合并分片失败");
        }
    }

    public FileInfo getFile(String id) {
        FileInfo fileInfo = fileInfoMapper.selectById(id);
        if (fileInfo == null) {
            throw new BusinessException("文件不存在");
        }
        return fileInfo;
    }

    public List<FileInfo> listFiles(Long projectId) {
        return fileInfoMapper.selectList(new LambdaQueryWrapper<FileInfo>()
                .eq(FileInfo::getProjectId, projectId)
                .eq(FileInfo::getStatus, 1)
                .orderByDesc(FileInfo::getUploadTime));
    }

    public void deleteFile(String id) {
        FileInfo fileInfo = fileInfoMapper.selectById(id);
        if (fileInfo == null) {
            throw new BusinessException("文件不存在");
        }

        if (StrUtil.isNotBlank(fileInfo.getStoragePath())) {
            minioUtils.deleteFile(fileInfo.getStoragePath());
        }

        fileInfoMapper.deleteById(id);
        log.info("文件删除成功: id={}", id);
    }

    public String downloadFile(String id) {
        FileInfo fileInfo = getFile(id);
        return minioUtils.getFileUrl(fileInfo.getStoragePath());
    }

    public String getPreviewUrl(String id) {
        FileInfo fileInfo = getFile(id);
        return minioUtils.getPreviewUrl(fileInfo.getStoragePath());
    }

    public String getOptimizedUrl(String fileId) {
        return imageCompressionService.getOptimizedUrl(fileId);
    }

    private String buildStoragePath(Long projectId, String fileName) {
        return "files/" + projectId + "/" + fileName;
    }

    private String buildChunkPath(String fileId, int chunkIndex) {
        return "temp/uploads/" + fileId + "/chunk_" + chunkIndex;
    }

    private FileInfo getFileInfoByStoragePath(String storagePath) {
        return fileInfoMapper.selectOne(new LambdaQueryWrapper<FileInfo>()
                .eq(FileInfo::getStoragePath, storagePath)
                .eq(FileInfo::getStatus, 1)
                .last("LIMIT 1"));
    }

    private List<Integer> parseUploadedChunks(String uploadedChunks) {
        if (StrUtil.isBlank(uploadedChunks)) {
            return List.of();
        }
        return Arrays.stream(uploadedChunks.split(","))
                .map(String::trim)
                .filter(StrUtil::isNotBlank)
                .map(Integer::parseInt)
                .collect(Collectors.toList());
    }
}
