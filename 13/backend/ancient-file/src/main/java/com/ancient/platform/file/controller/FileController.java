package com.ancient.platform.file.controller;

import com.ancient.platform.common.result.Result;
import com.ancient.platform.file.dto.*;
import com.ancient.platform.file.entity.FileInfo;
import com.ancient.platform.file.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService fileStorageService;

    @PostMapping("/upload/initialize")
    public Result<InitializeUploadResponse> initializeUpload(@RequestBody InitializeUploadRequest request) {
        InitializeUploadResponse response = fileStorageService.initializeUpload(request);
        return Result.success(response);
    }

    @PostMapping("/upload/chunk")
    public Result<ChunkUploadResponse> uploadChunk(
            @RequestParam("chunk") MultipartFile chunk,
            ChunkUploadRequest request) {
        ChunkUploadResponse response = fileStorageService.uploadChunk(request, chunk);
        return Result.success(response);
    }

    @PostMapping("/upload/complete")
    public Result<CompleteUploadResponse> completeUpload(@RequestBody CompleteUploadRequest request) {
        CompleteUploadResponse response = fileStorageService.completeUpload(request);
        return Result.success(response);
    }

    @GetMapping("/projects/{projectId}")
    public Result<List<FileInfo>> listFiles(@PathVariable Long projectId) {
        List<FileInfo> files = fileStorageService.listFiles(projectId);
        return Result.success(files);
    }

    @GetMapping("/{id}")
    public Result<FileInfo> getFile(@PathVariable String id) {
        FileInfo fileInfo = fileStorageService.getFile(id);
        return Result.success(fileInfo);
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteFile(@PathVariable String id) {
        fileStorageService.deleteFile(id);
        return Result.success();
    }

    @GetMapping("/{id}/download")
    public Result<String> downloadFile(@PathVariable String id) {
        String url = fileStorageService.downloadFile(id);
        return Result.success(url);
    }

    @GetMapping("/{id}/preview")
    public Result<String> getPreviewUrl(@PathVariable String id) {
        String url = fileStorageService.getPreviewUrl(id);
        return Result.success(url);
    }

    @GetMapping("/{id}/optimized")
    public Result<String> getOptimizedUrl(@PathVariable String id) {
        String url = fileStorageService.getOptimizedUrl(id);
        return Result.success(url);
    }
}
