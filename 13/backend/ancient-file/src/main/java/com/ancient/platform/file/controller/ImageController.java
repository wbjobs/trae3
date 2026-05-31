package com.ancient.platform.file.controller;

import com.ancient.platform.common.result.Result;
import com.ancient.platform.file.entity.FileInfo;
import com.ancient.platform.file.entity.ImageConversionRecord;
import com.ancient.platform.file.service.ImageCompressionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/images")
@RequiredArgsConstructor
public class ImageController {

    private final ImageCompressionService imageCompressionService;

    @PostMapping("/convert")
    public Result<Map<String, Object>> convertImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "0.8") float quality,
            @RequestParam(defaultValue = "webp") String format) throws IOException {
        Map<String, Object> result;
        if ("webp".equalsIgnoreCase(format)) {
            result = imageCompressionService.convertToWebP(file, quality);
        } else {
            throw new IllegalArgumentException("不支持的目标格式: " + format);
        }
        return Result.success(result);
    }

    @PostMapping("/{fileId}/thumbnail")
    public Result<FileInfo> generateThumbnail(
            @PathVariable String fileId,
            @RequestParam(defaultValue = "400") int width,
            @RequestParam(defaultValue = "400") int height) throws IOException {
        FileInfo thumbnail = imageCompressionService.generateThumbnail(fileId, width, height);
        return Result.success(thumbnail);
    }

    @PostMapping("/{fileId}/pyramid")
    public Result<Map<String, Object>> generatePyramidTiles(@PathVariable String fileId) throws IOException {
        Map<String, Object> result = imageCompressionService.generatePyramidTiles(fileId);
        return Result.success(result);
    }

    @PostMapping("/projects/{projectId}/compress")
    public Result<Void> compressProjectImages(
            @PathVariable Long projectId,
            @RequestParam(defaultValue = "0.8") float quality) {
        imageCompressionService.compressImagesByProject(projectId, quality);
        return Result.success();
    }

    @GetMapping("/projects/{projectId}/conversion-history")
    public Result<List<ImageConversionRecord>> getConversionHistory(@PathVariable Long projectId) {
        List<ImageConversionRecord> history = imageCompressionService.getConversionHistory(projectId);
        return Result.success(history);
    }

    @GetMapping("/{fileId}/compression-info")
    public Result<Map<String, Object>> getCompressionInfo(@PathVariable String fileId) {
        Map<String, Object> info = imageCompressionService.getCompressionInfo(fileId);
        return Result.success(info);
    }

    @GetMapping("/{fileId}/optimized-url")
    public Result<String> getOptimizedUrl(@PathVariable String fileId) {
        String url = imageCompressionService.getOptimizedUrl(fileId);
        return Result.success(url);
    }

    @GetMapping("/{fileId}/thumbnail-url")
    public Result<String> getThumbnailUrl(
            @PathVariable String fileId,
            @RequestParam(defaultValue = "400") int size) {
        String url = imageCompressionService.getThumbnailUrl(fileId, size);
        return Result.success(url);
    }
}
