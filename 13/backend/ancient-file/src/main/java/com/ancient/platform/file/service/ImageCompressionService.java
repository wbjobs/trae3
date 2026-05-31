package com.ancient.platform.file.service;

import com.ancient.platform.common.exception.BusinessException;
import com.ancient.platform.common.file.MinioUtils;
import com.ancient.platform.common.service.WebSocketNotificationService;
import com.ancient.platform.file.config.ImageCompressionProperties;
import com.ancient.platform.file.entity.FileInfo;
import com.ancient.platform.file.entity.ImageConversionRecord;
import com.ancient.platform.file.mapper.FileInfoMapper;
import com.ancient.platform.file.mapper.ImageConversionRecordMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.*;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ImageCompressionService {

    private final FileInfoMapper fileInfoMapper;
    private final ImageConversionRecordMapper conversionRecordMapper;
    private final MinioUtils minioUtils;
    private final MinioConfig minioConfig;
    private final ImageCompressionProperties properties;
    private final WebSocketNotificationService notificationService;

    private static final List<String> SUPPORTED_FORMATS = List.of("tiff", "tif", "jpeg", "jpg", "png", "webp");

    public Map<String, Object> convertToWebP(MultipartFile file, float quality) throws IOException {
        validateQuality(quality);
        validateImageFormat(file.getOriginalFilename());

        BufferedImage originalImage = ImageIO.read(file.getInputStream());
        if (originalImage == null) {
            throw new BusinessException("无法读取图片文件");
        }

        String originalName = file.getOriginalFilename();
        String baseName = originalName != null ? originalName.substring(0, originalName.lastIndexOf('.')) : "image";
        String targetFileName = baseName + ".webp";

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        writeWebP(originalImage, outputStream, quality);

        byte[] webpBytes = outputStream.toByteArray();
        long sourceSize = file.getSize();
        long targetSize = webpBytes.length;

        Map<String, Object> result = new HashMap<>();
        result.put("fileName", targetFileName);
        result.put("sourceSize", sourceSize);
        result.put("targetSize", targetSize);
        result.put("compressionRatio", (double) (sourceSize - targetSize) / sourceSize * 100);
        result.put("width", originalImage.getWidth());
        result.put("height", originalImage.getHeight());
        result.put("data", webpBytes);
        result.put("contentType", "image/webp");

        return result;
    }

    public FileInfo convertFileToWebP(String fileId, float quality) throws IOException {
        validateQuality(quality);
        FileInfo sourceFile = getFileInfo(fileId);
        validateImageFormat(sourceFile.getFileName());

        BufferedImage originalImage = readImageFromMinio(sourceFile.getStoragePath());
        if (originalImage == null) {
            throw new BusinessException("无法读取图片文件");
        }

        String backupPath = backupOriginalFile(sourceFile);

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        writeWebP(originalImage, outputStream, quality);

        byte[] webpBytes = outputStream.toByteArray();
        String targetFileName = replaceExtension(sourceFile.getFileName(), "webp");
        String targetStoragePath = replaceExtension(sourceFile.getStoragePath(), "webp");

        String url = minioUtils.uploadFile(
                targetStoragePath,
                new ByteArrayInputStream(webpBytes),
                webpBytes.length,
                "image/webp"
        );

        long sourceSize = sourceFile.getFileSize();
        long targetSize = webpBytes.length;

        FileInfo targetFile = createTargetFileInfo(sourceFile, targetFileName, targetStoragePath, url, targetSize, "image/webp");
        fileInfoMapper.insert(targetFile);

        saveConversionRecord(sourceFile, targetFile, sourceSize, targetSize, quality,
                originalImage.getWidth(), originalImage.getHeight(), 1);

        updateSourceFileUrl(sourceFile, url, targetStoragePath);

        return targetFile;
    }

    public FileInfo generateThumbnail(String fileId, int width, int height) throws IOException {
        FileInfo sourceFile = getFileInfo(fileId);
        validateImageFormat(sourceFile.getFileName());

        BufferedImage originalImage = readImageFromMinio(sourceFile.getStoragePath());
        if (originalImage == null) {
            throw new BusinessException("无法读取图片文件");
        }

        int originalWidth = originalImage.getWidth();
        int originalHeight = originalImage.getHeight();

        double scale = Math.min((double) width / originalWidth, (double) height / originalHeight);
        int targetWidth = (int) (originalWidth * scale);
        int targetHeight = (int) (originalHeight * scale);

        BufferedImage thumbnail = Thumbnails.of(originalImage)
                .size(targetWidth, targetHeight)
                .keepAspectRatio(true)
                .asBufferedImage();

        String baseName = sourceFile.getFileName().substring(0, sourceFile.getFileName().lastIndexOf('.'));
        String ext = getFileExtension(sourceFile.getFileName());
        String targetFileName = baseName + "_thumb_" + width + "x" + height + "." + ext;
        String targetStoragePath = replaceExtension(sourceFile.getStoragePath(), "") + "_thumb_" + width + "x" + height + "." + ext;

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        ImageIO.write(thumbnail, ext, outputStream);
        byte[] thumbnailBytes = outputStream.toByteArray();

        String url = minioUtils.uploadFile(
                targetStoragePath,
                new ByteArrayInputStream(thumbnailBytes),
                thumbnailBytes.length,
                "image/" + ext
        );

        FileInfo targetFile = createTargetFileInfo(sourceFile, targetFileName, targetStoragePath, url,
                thumbnailBytes.length, "image/" + ext);
        fileInfoMapper.insert(targetFile);

        return targetFile;
    }

    public Map<String, Object> generatePyramidTiles(String fileId) throws IOException {
        FileInfo sourceFile = getFileInfo(fileId);
        validateImageFormat(sourceFile.getFileName());

        BufferedImage originalImage = readImageFromMinio(sourceFile.getStoragePath());
        if (originalImage == null) {
            throw new BusinessException("无法读取图片文件");
        }

        int tileSize = properties.getPyramid().getTileSize();
        int width = originalImage.getWidth();
        int height = originalImage.getHeight();

        String basePath = sourceFile.getStoragePath().substring(0, sourceFile.getStoragePath().lastIndexOf('.'));
        String tilesBasePath = basePath + "_tiles/";

        int maxLevel = (int) Math.ceil(Math.log(Math.max(width, height)) / Math.log(2));
        int tilesGenerated = 0;

        for (int level = 0; level <= maxLevel; level++) {
            double scale = Math.pow(0.5, maxLevel - level);
            int levelWidth = Math.max(1, (int) (width * scale));
            int levelHeight = Math.max(1, (int) (height * scale));

            BufferedImage levelImage = Thumbnails.of(originalImage)
                    .size(levelWidth, levelHeight)
                    .keepAspectRatio(true)
                    .asBufferedImage();

            int tilesX = (int) Math.ceil((double) levelWidth / tileSize);
            int tilesY = (int) Math.ceil((double) levelHeight / tileSize);

            for (int x = 0; x < tilesX; x++) {
                for (int y = 0; y < tilesY; y++) {
                    int tileX = x * tileSize;
                    int tileY = y * tileSize;
                    int tileWidth = Math.min(tileSize, levelWidth - tileX);
                    int tileHeight = Math.min(tileSize, levelHeight - tileY);

                    BufferedImage tile = levelImage.getSubimage(tileX, tileY, tileWidth, tileHeight);

                    String tilePath = tilesBasePath + level + "/" + x + "_" + y + ".jpg";
                    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                    ImageIO.write(tile, "jpg", outputStream);
                    byte[] tileBytes = outputStream.toByteArray();

                    minioUtils.uploadFile(
                            tilePath,
                            new ByteArrayInputStream(tileBytes),
                            tileBytes.length,
                            "image/jpeg"
                    );

                    tilesGenerated++;
                }
            }
        }

        Map<String, Object> dziInfo = generateDZI(width, height, tileSize, tilesBasePath);
        String dziPath = basePath + ".dzi";
        String dziContent = generateDZIXml(dziInfo);

        minioUtils.uploadFile(
                dziPath,
                new ByteArrayInputStream(dziContent.getBytes()),
                dziContent.getBytes().length,
                "application/xml"
        );

        Map<String, Object> result = new HashMap<>();
        result.put("tileSize", tileSize);
        result.put("width", width);
        result.put("height", height);
        result.put("levels", maxLevel + 1);
        result.put("tilesGenerated", tilesGenerated);
        result.put("dziUrl", minioUtils.getFileUrl(dziPath));
        result.put("tilesBaseUrl", minioUtils.getFileUrl(tilesBasePath));

        saveConversionRecord(sourceFile, null, (long) width * height * 3,
                (long) tilesGenerated * tileSize * tileSize * 0.1f, 0.8f, width, height, 1);

        return result;
    }

    @Async
    @Transactional
    public void compressImagesByProject(Long projectId, float quality) {
        validateQuality(quality);

        List<FileInfo> images = fileInfoMapper.selectList(new LambdaQueryWrapper<FileInfo>()
                .eq(FileInfo::getProjectId, projectId)
                .eq(FileInfo::getStatus, 1)
                .like(FileInfo::getFileType, "image/")
                .orderByDesc(FileInfo::getUploadTime));

        int total = images.size();
        int success = 0;
        int failed = 0;

        log.info("开始批量压缩项目图片: projectId={}, total={}, quality={}", projectId, total, quality);

        for (int i = 0; i < images.size(); i++) {
            FileInfo image = images.get(i);
            try {
                notificationService.sendCompressionProgress(projectId, i + 1, total, image.getFileName());
                convertFileToWebP(image.getId(), quality);
                success++;
                log.info("压缩成功: fileId={}, fileName={}", image.getId(), image.getFileName());
            } catch (Exception e) {
                failed++;
                log.error("压缩失败: fileId={}, fileName={}, error={}", image.getId(), image.getFileName(), e.getMessage());
            }
        }

        log.info("批量压缩完成: projectId={}, total={}, success={}, failed={}", projectId, total, success, failed);
        notificationService.sendCompressionComplete(projectId, total, success, failed);
    }

    public List<ImageConversionRecord> getConversionHistory(Long projectId) {
        return conversionRecordMapper.selectList(new LambdaQueryWrapper<ImageConversionRecord>()
                .eq(ImageConversionRecord::getProjectId, projectId)
                .orderByDesc(ImageConversionRecord::getConversionTime));
    }

    public Map<String, Object> getCompressionInfo(String fileId) {
        FileInfo fileInfo = getFileInfo(fileId);

        List<ImageConversionRecord> records = conversionRecordMapper.selectList(
                new LambdaQueryWrapper<ImageConversionRecord>()
                        .eq(ImageConversionRecord::getSourceFileId, fileId)
                        .orderByDesc(ImageConversionRecord::getConversionTime)
        );

        Map<String, Object> result = new HashMap<>();
        result.put("fileId", fileId);
        result.put("fileName", fileInfo.getFileName());
        result.put("currentSize", fileInfo.getFileSize());
        result.put("url", fileInfo.getUrl());
        result.put("optimizedUrl", getOptimizedUrl(fileId));
        result.put("conversionHistory", records);

        String basePath = fileInfo.getStoragePath().substring(0, fileInfo.getStoragePath().lastIndexOf('.'));
        String dziPath = basePath + ".dzi";
        if (minioUtils.fileExists(dziPath)) {
            result.put("dziUrl", minioUtils.getFileUrl(dziPath));
            result.put("hasPyramidTiles", true);
        } else {
            result.put("hasPyramidTiles", false);
        }

        for (Integer size : properties.getThumbnail().getSizes()) {
            String thumbUrl = getThumbnailUrl(fileId, size);
            if (!thumbUrl.equals(fileInfo.getUrl())) {
                result.put("thumbnailUrl_" + size, thumbUrl);
            }
        }

        if (!records.isEmpty()) {
            ImageConversionRecord latest = records.get(0);
            result.put("originalSize", latest.getSourceSize());
            result.put("compressedSize", latest.getTargetSize());
            result.put("compressionRatio", calculateCompressionRatio(fileId));
            result.put("quality", latest.getQuality());
            result.put("width", latest.getWidth());
            result.put("height", latest.getHeight());
        }

        return result;
    }

    public double calculateCompressionRatio(String fileId) {
        List<ImageConversionRecord> records = conversionRecordMapper.selectList(
                new LambdaQueryWrapper<ImageConversionRecord>()
                        .eq(ImageConversionRecord::getTargetFileId, fileId)
                        .or()
                        .eq(ImageConversionRecord::getSourceFileId, fileId)
                        .orderByDesc(ImageConversionRecord::getConversionTime)
                        .last("LIMIT 1")
        );

        if (records.isEmpty()) {
            return 0.0;
        }

        ImageConversionRecord record = records.get(0);
        if (record.getSourceSize() == null || record.getSourceSize() == 0) {
            return 0.0;
        }

        return (double) (record.getSourceSize() - record.getTargetSize()) / record.getSourceSize() * 100;
    }

    public void autoProcessImage(FileInfo fileInfo) throws IOException {
        if (fileInfo.getFileType() == null || !fileInfo.getFileType().startsWith("image/")) {
            return;
        }

        if (!isSupportedFormat(fileInfo.getFileName())) {
            return;
        }

        log.info("自动处理图片: fileId={}, fileName={}", fileInfo.getId(), fileInfo.getFileName());

        try {
            convertFileToWebP(fileInfo.getId(), properties.getDefaultQuality());
        } catch (Exception e) {
            log.warn("自动转换WebP失败: fileId={}, error={}", fileInfo.getId(), e.getMessage());
        }

        for (Integer size : properties.getThumbnail().getSizes()) {
            try {
                generateThumbnail(fileInfo.getId(), size, size);
            } catch (Exception e) {
                log.warn("生成缩略图失败: fileId={}, size={}, error={}", fileInfo.getId(), size, e.getMessage());
            }
        }
    }

    public String getOptimizedUrl(String fileId) {
        FileInfo fileInfo = getFileInfo(fileId);

        if (fileInfo.getFileType() == null || !fileInfo.getFileType().startsWith("image/")) {
            return fileInfo.getUrl();
        }

        String webpPath = replaceExtension(fileInfo.getStoragePath(), "webp");
        if (minioUtils.fileExists(webpPath)) {
            return minioUtils.getFileUrl(webpPath);
        }

        return fileInfo.getUrl();
    }

    public String getThumbnailUrl(String fileId, int size) {
        FileInfo fileInfo = getFileInfo(fileId);

        String basePath = fileInfo.getStoragePath().substring(0, fileInfo.getStoragePath().lastIndexOf('.'));
        String ext = getFileExtension(fileInfo.getFileName());
        String thumbPath = basePath + "_thumb_" + size + "x" + size + "." + ext;

        if (minioUtils.fileExists(thumbPath)) {
            return minioUtils.getFileUrl(thumbPath);
        }

        return fileInfo.getUrl();
    }

    private FileInfo getFileInfo(String fileId) {
        FileInfo fileInfo = fileInfoMapper.selectById(fileId);
        if (fileInfo == null) {
            throw new BusinessException("文件不存在");
        }
        return fileInfo;
    }

    private void validateQuality(float quality) {
        if (quality < 0.0f || quality > 1.0f) {
            throw new BusinessException("质量参数必须在 0.0 - 1.0 之间");
        }
    }

    private void validateImageFormat(String fileName) {
        if (!isSupportedFormat(fileName)) {
            throw new BusinessException("不支持的图片格式，支持: TIFF, JPEG, PNG, WebP");
        }
    }

    private boolean isSupportedFormat(String fileName) {
        if (fileName == null) {
            return false;
        }
        String ext = getFileExtension(fileName).toLowerCase();
        return SUPPORTED_FORMATS.contains(ext);
    }

    private String getFileExtension(String fileName) {
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex == -1 || dotIndex == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(dotIndex + 1);
    }

    private String replaceExtension(String fileName, String newExt) {
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex == -1) {
            return fileName + "." + newExt;
        }
        return fileName.substring(0, dotIndex) + (newExt.isEmpty() ? "" : "." + newExt);
    }

    private BufferedImage readImageFromMinio(String storagePath) throws IOException {
        try (InputStream inputStream = minioUtils.downloadFile(storagePath)) {
            return ImageIO.read(inputStream);
        }
    }

    private String backupOriginalFile(FileInfo sourceFile) {
        String backupPath = sourceFile.getStoragePath() + ".original";
        minioUtils.copyFile(sourceFile.getStoragePath(), backupPath);
        log.info("原图已备份: source={}, backup={}", sourceFile.getStoragePath(), backupPath);
        return backupPath;
    }

    private void writeWebP(BufferedImage image, OutputStream outputStream, float quality) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("webp").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(quality);

        try (ImageOutputStream ios = ImageIO.createImageOutputStream(outputStream)) {
            writer.setOutput(ios);
            writer.write(null, new IIOImage(image, null, null), param);
            writer.dispose();
        }
    }

    private FileInfo createTargetFileInfo(FileInfo source, String fileName, String storagePath,
                                          String url, long size, String contentType) {
        FileInfo target = new FileInfo();
        target.setId(UUID.randomUUID().toString());
        target.setProjectId(source.getProjectId());
        target.setFileName(fileName);
        target.setOriginalName(fileName);
        target.setFileType(contentType);
        target.setFileSize(size);
        target.setStoragePath(storagePath);
        target.setUrl(url);
        target.setMd5(source.getMd5());
        target.setUploaderId(source.getUploaderId());
        target.setUploadTime(LocalDateTime.now());
        target.setStatus(1);
        target.setDeleted(0);
        return target;
    }

    private void saveConversionRecord(FileInfo source, FileInfo target, Long sourceSize, Long targetSize,
                                      Float quality, Integer width, Integer height, Integer status) {
        ImageConversionRecord record = new ImageConversionRecord();
        record.setProjectId(source.getProjectId());
        record.setSourceFileId(source.getId());
        record.setTargetFileId(target != null ? target.getId() : null);
        record.setSourceFormat(getFileExtension(source.getFileName()));
        record.setTargetFormat(target != null ? getFileExtension(target.getFileName()) : "dzi");
        record.setSourceSize(sourceSize);
        record.setTargetSize(targetSize);
        record.setQuality(quality);
        record.setWidth(width);
        record.setHeight(height);
        record.setConversionTime(LocalDateTime.now());
        record.setStatus(status);
        record.setDeleted(0);
        conversionRecordMapper.insert(record);
    }

    private void updateSourceFileUrl(FileInfo sourceFile, String url, String storagePath) {
        fileInfoMapper.update(null, new LambdaUpdateWrapper<FileInfo>()
                .eq(FileInfo::getId, sourceFile.getId())
                .set(FileInfo::getUrl, url)
                .set(FileInfo::getStoragePath, storagePath));
    }

    private Map<String, Object> generateDZI(int width, int height, int tileSize, String tilesUrl) {
        Map<String, Object> dzi = new HashMap<>();
        dzi.put("xmlns", "http://schemas.microsoft.com/deepzoom/2008");
        dzi.put("Url", tilesUrl);
        dzi.put("Format", "jpg");
        dzi.put("TileSize", tileSize);
        dzi.put("Overlap", "0");
        dzi.put("Width", width);
        dzi.put("Height", height);
        return dzi;
    }

    private String generateDZIXml(Map<String, Object> dziInfo) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
                "<Image xmlns=\"" + dziInfo.get("xmlns") + "\" " +
                "Url=\"" + dziInfo.get("Url") + "\" " +
                "Format=\"" + dziInfo.get("Format") + "\" " +
                "TileSize=\"" + dziInfo.get("TileSize") + "\" " +
                "Overlap=\"" + dziInfo.get("Overlap") + "\">\n" +
                "  <Size Width=\"" + dziInfo.get("Width") + "\" Height=\"" + dziInfo.get("Height") + "\"/>\n" +
                "</Image>";
    }
}
