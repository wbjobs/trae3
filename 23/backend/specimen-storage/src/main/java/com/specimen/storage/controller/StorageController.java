package com.specimen.storage.controller;

import com.specimen.common.result.Result;
import com.specimen.storage.dto.*;
import com.specimen.storage.service.MinioService;
import com.specimen.storage.service.StorageFileService;
import io.minio.messages.Part;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/storage")
@RequiredArgsConstructor
public class StorageController {
    private final StorageFileService storageFileService;
    private final MinioService minioService;

    @PostMapping("/upload")
    public Result<FileUploadVO> upload(@RequestParam("file") MultipartFile file) {
        return Result.success(storageFileService.uploadFile(file));
    }

    @PostMapping("/batch-upload")
    public Result<List<FileUploadVO>> batchUpload(@RequestParam("files") List<MultipartFile> files) {
        return Result.success(storageFileService.batchUpload(files));
    }

    @GetMapping("/{id}")
    public Result<FileInfoVO> getFileInfo(@PathVariable Long id) {
        return Result.success(storageFileService.getFileInfo(id));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteFile(@PathVariable Long id) {
        storageFileService.deleteFile(id);
        return Result.success();
    }

    @GetMapping("/preview")
    public Result<String> preview(@RequestParam String objectName,
                                  @RequestParam(required = false, defaultValue = "3600") Integer expires) {
        return Result.success(minioService.preview(objectName, expires));
    }

    @GetMapping("/download")
    public void download(@RequestParam String objectName,
                         @RequestParam(required = false) String fileName,
                         HttpServletResponse response) {
        try (InputStream inputStream = minioService.download(objectName);
             OutputStream outputStream = response.getOutputStream()) {
            response.setContentType("application/octet-stream");
            String downloadName = fileName != null ? fileName : objectName.substring(objectName.lastIndexOf("/") + 1);
            response.setHeader("Content-Disposition", "attachment; filename=" +
                    URLEncoder.encode(downloadName, StandardCharsets.UTF_8));
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
            }
            outputStream.flush();
        } catch (Exception e) {
            throw new RuntimeException("文件下载失败", e);
        }
    }

    @PostMapping("/multipart/init")
    public Result<Map<String, Object>> initMultipartUpload(@RequestBody MultipartUploadInitDTO dto) {
        return Result.success(storageFileService.initMultipartUpload(
                dto.getOriginalName(), dto.getFileSize(), dto.getPartCount()));
    }

    @PostMapping("/multipart/upload")
    public Result<Map<String, Object>> uploadPart(
            @RequestParam("file") MultipartFile file,
            @RequestParam("uploadId") String uploadId,
            @RequestParam("partNumber") Integer partNumber) {
        return Result.success(storageFileService.uploadPart(uploadId, partNumber, file));
    }

    @PostMapping("/multipart/complete")
    public Result<FileUploadVO> completeMultipartUpload(@RequestBody MultipartUploadCompleteDTO dto) {
        return Result.success(storageFileService.completeMultipartUpload(
                dto.getUploadId(), dto.getOriginalName(), dto.getParts()));
    }
}
