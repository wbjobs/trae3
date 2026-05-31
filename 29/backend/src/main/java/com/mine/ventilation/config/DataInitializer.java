package com.mine.ventilation.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mine.ventilation.common.Result;
import com.mine.ventilation.entity.Annotation;
import com.mine.ventilation.entity.Fan;
import com.mine.ventilation.entity.Pipe;
import com.mine.ventilation.entity.Tunnel;
import com.mine.ventilation.service.AnnotationService;
import com.mine.ventilation.service.FanService;
import com.mine.ventilation.service.PipeService;
import com.mine.ventilation.service.TunnelService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

@Configuration
public class DataInitializer {

    private static final Logger logger = LoggerFactory.getLogger(DataInitializer.class);

    @Value("${mine.ventilation.data.path:data/}")
    private String dataPath;

    @Value("${mine.ventilation.data.auto-init:true}")
    private boolean autoInit;

    @Value("${mine.ventilation.data.batch-size:100}")
    private int batchSize;

    private static final String[] DATA_FILES = {
        "tunnels.json",
        "pipes.json",
        "fans.json",
        "annotations.json"
    };

    private static final String CLASSPATH_DATA_PREFIX = "data/";

    private final ObjectMapper objectMapper;

    @Autowired
    private TunnelService tunnelService;

    @Autowired
    private PipeService pipeService;

    @Autowired
    private FanService fanService;

    @Autowired
    private AnnotationService annotationService;

    private final Map<String, Object> importStatus = new ConcurrentHashMap<>();
    private final AtomicBoolean importInProgress = new AtomicBoolean(false);

    public DataInitializer(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        if (!autoInit) {
            logger.info("数据自动初始化已禁用，跳过数据检查");
            return;
        }

        logger.info("开始检查并初始化通风管网数据...");
        long startTime = System.currentTimeMillis();

        try {
            copyDefaultDataFilesIfNeeded();

            long totalCount = getTotalCount();
            if (totalCount > 0) {
                logger.info("数据库中已有数据，跳过自动导入。当前数据量: tunnels={}, pipes={}, fans={}, annotations={}",
                    tunnelService.count(), pipeService.count(), fanService.count(), annotationService.count());
                return;
            }

            logger.info("数据库为空，开始自动导入数据...");
            Result<Map<String, Object>> importResult = importAllData();

            if (importResult.isSuccess()) {
                long endTime = System.currentTimeMillis();
                logger.info("数据自动导入完成，耗时: {}ms", (endTime - startTime));
            } else {
                logger.error("数据自动导入失败: {}", importResult.getMessage());
            }
        } catch (Exception e) {
            logger.error("数据初始化失败", e);
        }
    }

    public Result<Map<String, Object>> importAllData() {
        if (importInProgress.compareAndSet(false, true)) {
            try {
                importStatus.clear();
                importStatus.put("status", "running");
                importStatus.put("startTime", LocalDateTime.now().toString());
                importStatus.put("message", "数据导入中...");

                logger.info("========== 开始导入所有数据 ==========");
                long overallStartTime = System.currentTimeMillis();

                Map<String, Object> result = new HashMap<>();

                Result<Integer> tunnelResult = importTunnels();
                result.put("tunnels", tunnelResult.isSuccess() ? tunnelResult.getData() : 0);
                if (!tunnelResult.isSuccess()) {
                    result.put("tunnelsError", tunnelResult.getMessage());
                }

                Result<Integer> pipeResult = importPipes();
                result.put("pipes", pipeResult.isSuccess() ? pipeResult.getData() : 0);
                if (!pipeResult.isSuccess()) {
                    result.put("pipesError", pipeResult.getMessage());
                }

                Result<Integer> fanResult = importFans();
                result.put("fans", fanResult.isSuccess() ? fanResult.getData() : 0);
                if (!fanResult.isSuccess()) {
                    result.put("fansError", fanResult.getMessage());
                }

                Result<Integer> annotationResult = importAnnotations();
                result.put("annotations", annotationResult.isSuccess() ? annotationResult.getData() : 0);
                if (!annotationResult.isSuccess()) {
                    result.put("annotationsError", annotationResult.getMessage());
                }

                int total = (Integer) result.get("tunnels") + (Integer) result.get("pipes")
                    + (Integer) result.get("fans") + (Integer) result.get("annotations");
                result.put("total", total);

                long overallEndTime = System.currentTimeMillis();
                result.put("durationMs", overallEndTime - overallStartTime);

                importStatus.put("status", "completed");
                importStatus.put("endTime", LocalDateTime.now().toString());
                importStatus.put("result", result);
                importStatus.put("message", "数据导入完成");

                logger.info("========== 所有数据导入完成，总计: {} 条，耗时: {}ms ==========",
                    total, (overallEndTime - overallStartTime));

                return Result.success("数据导入成功", result);
            } catch (Exception e) {
                logger.error("数据导入失败", e);
                importStatus.put("status", "failed");
                importStatus.put("endTime", LocalDateTime.now().toString());
                importStatus.put("error", e.getMessage());
                return Result.error("数据导入失败: " + e.getMessage());
            } finally {
                importInProgress.set(false);
            }
        } else {
            return Result.error("已有导入任务正在进行中，请稍后再试");
        }
    }

    public Result<Integer> importTunnels() {
        logger.info("开始导入巷道数据...");
        long startTime = System.currentTimeMillis();

        try {
            List<Tunnel> tunnels = loadDataFromClasspath("tunnels.json", new TypeReference<List<Tunnel>>() {});
            if (tunnels == null || tunnels.isEmpty()) {
                logger.warn("巷道数据为空，跳过导入");
                return Result.success(0);
            }

            int savedCount = batchSave(tunnels, batchSize, (batch) -> {
                tunnelService.saveAll(batch);
                return batch.size();
            });

            long endTime = System.currentTimeMillis();
            logger.info("巷道数据导入完成，共导入 {} 条，耗时: {}ms", savedCount, (endTime - startTime));

            return Result.success(savedCount);
        } catch (Exception e) {
            logger.error("巷道数据导入失败", e);
            return Result.error("巷道数据导入失败: " + e.getMessage());
        }
    }

    public Result<Integer> importPipes() {
        logger.info("开始导入管道数据...");
        long startTime = System.currentTimeMillis();

        try {
            List<Pipe> pipes = loadDataFromClasspath("pipes.json", new TypeReference<List<Pipe>>() {});
            if (pipes == null || pipes.isEmpty()) {
                logger.warn("管道数据为空，跳过导入");
                return Result.success(0);
            }

            int savedCount = batchSave(pipes, batchSize, (batch) -> {
                pipeService.saveAll(batch);
                return batch.size();
            });

            long endTime = System.currentTimeMillis();
            logger.info("管道数据导入完成，共导入 {} 条，耗时: {}ms", savedCount, (endTime - startTime));

            return Result.success(savedCount);
        } catch (Exception e) {
            logger.error("管道数据导入失败", e);
            return Result.error("管道数据导入失败: " + e.getMessage());
        }
    }

    public Result<Integer> importFans() {
        logger.info("开始导入风机数据...");
        long startTime = System.currentTimeMillis();

        try {
            List<Fan> fans = loadDataFromClasspath("fans.json", new TypeReference<List<Fan>>() {});
            if (fans == null || fans.isEmpty()) {
                logger.warn("风机数据为空，跳过导入");
                return Result.success(0);
            }

            int savedCount = batchSave(fans, batchSize, (batch) -> {
                fanService.saveAll(batch);
                return batch.size();
            });

            long endTime = System.currentTimeMillis();
            logger.info("风机数据导入完成，共导入 {} 条，耗时: {}ms", savedCount, (endTime - startTime));

            return Result.success(savedCount);
        } catch (Exception e) {
            logger.error("风机数据导入失败", e);
            return Result.error("风机数据导入失败: " + e.getMessage());
        }
    }

    public Result<Integer> importAnnotations() {
        logger.info("开始导入标注数据...");
        long startTime = System.currentTimeMillis();

        try {
            List<Annotation> annotations = loadDataFromClasspath("annotations.json",
                new TypeReference<List<Annotation>>() {});
            if (annotations == null || annotations.isEmpty()) {
                logger.warn("标注数据为空，跳过导入");
                return Result.success(0);
            }

            int savedCount = batchSave(annotations, batchSize, (batch) -> {
                annotationService.saveAll(batch);
                return batch.size();
            });

            long endTime = System.currentTimeMillis();
            logger.info("标注数据导入完成，共导入 {} 条，耗时: {}ms", savedCount, (endTime - startTime));

            return Result.success(savedCount);
        } catch (Exception e) {
            logger.error("标注数据导入失败", e);
            return Result.error("标注数据导入失败: " + e.getMessage());
        }
    }

    public Result<Map<String, Object>> clearAllData() {
        logger.info("========== 开始清除所有数据 ==========");
        Map<String, Object> result = new HashMap<>();

        try {
            long tunnelCount = tunnelService.count();
            long pipeCount = pipeService.count();
            long fanCount = fanService.count();
            long annotationCount = annotationService.count();

            result.put("beforeClear", Map.of(
                "tunnels", tunnelCount,
                "pipes", pipeCount,
                "fans", fanCount,
                "annotations", annotationCount
            ));

            annotationService.deleteAll();
            logger.info("已清除标注数据: {} 条", annotationCount);

            fanService.deleteAll();
            logger.info("已清除风机数据: {} 条", fanCount);

            pipeService.deleteAll();
            logger.info("已清除管道数据: {} 条", pipeCount);

            tunnelService.deleteAll();
            logger.info("已清除巷道数据: {} 条", tunnelCount);

            result.put("afterClear", Map.of(
                "tunnels", tunnelService.count(),
                "pipes", pipeService.count(),
                "fans", fanService.count(),
                "annotations", annotationService.count()
            ));

            result.put("totalCleared", tunnelCount + pipeCount + fanCount + annotationCount);

            logger.info("========== 所有数据清除完成，共清除 {} 条 ==========",
                tunnelCount + pipeCount + fanCount + annotationCount);

            return Result.success("数据清除成功", result);
        } catch (Exception e) {
            logger.error("数据清除失败", e);
            return Result.error("数据清除失败: " + e.getMessage());
        }
    }

    public Result<Map<String, Object>> getImportStatus() {
        Map<String, Object> status = new HashMap<>();

        if (!importStatus.isEmpty()) {
            status.put("importTask", new HashMap<>(importStatus));
        } else {
            status.put("importTask", Map.of(
                "status", "idle",
                "message", "没有正在进行的导入任务"
            ));
        }

        Map<String, Object> collectionCounts = new HashMap<>();
        collectionCounts.put("tunnels", tunnelService.count());
        collectionCounts.put("pipes", pipeService.count());
        collectionCounts.put("fans", fanService.count());
        collectionCounts.put("annotations", annotationService.count());
        status.put("collections", collectionCounts);

        status.put("total", getTotalCount());
        status.put("importInProgress", importInProgress.get());

        return Result.success(status);
    }

    public Result<Map<String, Object>> reimportAllData() {
        logger.info("========== 开始重新导入所有数据 ==========");

        if (importInProgress.get()) {
            return Result.error("已有导入任务正在进行中，请稍后再试");
        }

        try {
            Result<Map<String, Object>> clearResult = clearAllData();
            if (!clearResult.isSuccess()) {
                logger.error("重新导入前清除数据失败: {}", clearResult.getMessage());
                return Result.error("重新导入前清除数据失败: " + clearResult.getMessage());
            }

            Result<Map<String, Object>> importResult = importAllData();

            if (importResult.isSuccess()) {
                logger.info("========== 数据重新导入完成 ==========");
            } else {
                logger.error("========== 数据重新导入失败 ==========");
            }

            return importResult;
        } catch (Exception e) {
            logger.error("重新导入数据失败", e);
            return Result.error("重新导入数据失败: " + e.getMessage());
        }
    }

    private long getTotalCount() {
        return tunnelService.count() + pipeService.count() + fanService.count() + annotationService.count();
    }

    private <T> T loadDataFromClasspath(String fileName, TypeReference<T> typeRef) throws IOException {
        String classpathResource = CLASSPATH_DATA_PREFIX + fileName;

        try (InputStream inputStream = new ClassPathResource(classpathResource).getInputStream()) {
            if (inputStream == null) {
                throw new IOException("Classpath 中未找到数据文件: " + classpathResource);
            }

            return objectMapper.readValue(inputStream, typeRef);
        }
    }

    private <T> int batchSave(List<T> items, int batchSize, java.util.function.Function<List<T>, Integer> saver) {
        int totalSaved = 0;
        int itemCount = items.size();

        for (int i = 0; i < itemCount; i += batchSize) {
            int end = Math.min(i + batchSize, itemCount);
            List<T> batch = items.subList(i, end);
            int saved = saver.apply(batch);
            totalSaved += saved;

            if (logger.isInfoEnabled() && itemCount > batchSize) {
                int progress = Math.min((end * 100) / itemCount, 100);
                logger.info("批量导入进度: {}/{} ({}%)", end, itemCount, progress);
            }
        }

        return totalSaved;
    }

    private void copyDefaultDataFilesIfNeeded() {
        try {
            Path dataDir = Paths.get(dataPath);
            if (!Files.exists(dataDir)) {
                logger.info("数据目录不存在，创建目录: {}", dataDir.toAbsolutePath());
                Files.createDirectories(dataDir);
            }

            for (String fileName : DATA_FILES) {
                checkAndInitDataFile(dataDir, fileName);
            }
        } catch (Exception e) {
            logger.warn("复制默认数据文件失败，不影响 MongoDB 导入: {}", e.getMessage());
        }
    }

    private void checkAndInitDataFile(Path dataDir, String fileName) {
        Path targetFile = dataDir.resolve(fileName);

        if (Files.exists(targetFile)) {
            validateDataFile(targetFile, fileName);
        } else {
            copyDefaultDataFile(targetFile, fileName);
        }
    }

    private void validateDataFile(Path filePath, String fileName) {
        try {
            long fileSize = Files.size(filePath);
            if (fileSize == 0) {
                copyDefaultDataFile(filePath, fileName);
                return;
            }

            String content = Files.readString(filePath);
            if (content.isBlank()) {
                copyDefaultDataFile(filePath, fileName);
                return;
            }

            try {
                Object data = objectMapper.readValue(content, List.class);
                if (data instanceof List<?> list && list.isEmpty()) {
                    copyDefaultDataFile(filePath, fileName);
                    return;
                }
                logger.info("数据文件验证通过: {}, 数据量: {}", fileName,
                    data instanceof List<?> list ? list.size() : "未知");
            } catch (Exception e) {
                logger.warn("数据文件格式无效: {}, 重新初始化, 原因: {}", fileName, e.getMessage());
                copyDefaultDataFile(filePath, fileName);
            }
        } catch (IOException e) {
            logger.error("验证数据文件失败: {}", fileName, e);
        }
    }

    private void copyDefaultDataFile(Path targetFile, String fileName) {
        String classpathResource = "data/" + fileName;

        try (InputStream inputStream = new ClassPathResource(classpathResource).getInputStream()) {
            if (inputStream == null) {
                logger.error("classpath中未找到默认数据文件: {}", classpathResource);
                return;
            }

            Files.createDirectories(targetFile.getParent());
            Files.copy(inputStream, targetFile, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            logger.info("已复制默认数据文件: {} -> {}", classpathResource, targetFile.toAbsolutePath());

            long fileSize = Files.size(targetFile);
            logger.info("数据文件大小: {} bytes", fileSize);

        } catch (IOException e) {
            logger.error("复制默认数据文件失败: {}", fileName, e);
        }
    }

    public Result<Map<String, Object>> getDataStatus() {
        try {
            Path dataDir = Paths.get(dataPath);
            Map<String, Object> status = new HashMap<>();

            status.put("dataDirectory", dataDir.toAbsolutePath().toString());
            status.put("autoInit", autoInit);
            status.put("totalFiles", DATA_FILES.length);

            Map<String, Object> fileStatus = new HashMap<>();
            for (String fileName : DATA_FILES) {
                Path targetFile = dataDir.resolve(fileName);
                Map<String, Object> info = new HashMap<>();
                info.put("exists", Files.exists(targetFile));
                if (Files.exists(targetFile)) {
                    info.put("size", Files.size(targetFile));
                    info.put("lastModified", Files.getLastModifiedTime(targetFile).toString());

                    try {
                        String content = Files.readString(targetFile);
                        Object data = objectMapper.readValue(content, List.class);
                        info.put("recordCount", data instanceof List<?> list ? list.size() : -1);
                        info.put("valid", true);
                    } catch (Exception e) {
                        info.put("valid", false);
                        info.put("error", e.getMessage());
                    }
                }
                fileStatus.put(fileName, info);
            }
            status.put("files", fileStatus);

            return Result.success(status);
        } catch (Exception e) {
            logger.error("获取数据状态失败", e);
            return Result.error("获取数据状态失败: " + e.getMessage());
        }
    }

    public <T> Result<T> loadDataFromFile(String fileName, Class<T> clazz) {
        try {
            Path dataDir = Paths.get(dataPath);
            Path targetFile = dataDir.resolve(fileName);

            if (!Files.exists(targetFile)) {
                return Result.error("数据文件不存在: " + fileName);
            }

            String content = Files.readString(targetFile);
            T data = objectMapper.readValue(content, clazz);

            return Result.success(data);
        } catch (IOException e) {
            logger.error("读取数据文件失败: {}", fileName, e);
            return Result.error("读取数据文件失败: " + e.getMessage());
        }
    }

    public <T> Result<T> loadDataFromFile(String fileName, TypeReference<T> typeRef) {
        try {
            Path dataDir = Paths.get(dataPath);
            Path targetFile = dataDir.resolve(fileName);

            if (!Files.exists(targetFile)) {
                return Result.error("数据文件不存在: " + fileName);
            }

            String content = Files.readString(targetFile);
            T data = objectMapper.readValue(content, typeRef);

            return Result.success(data);
        } catch (IOException e) {
            logger.error("读取数据文件失败: {}", fileName, e);
            return Result.error("读取数据文件失败: " + e.getMessage());
        }
    }

    public <T> Result<Boolean> saveDataToFile(String fileName, T data) {
        try {
            Path dataDir = Paths.get(dataPath);
            if (!Files.exists(dataDir)) {
                Files.createDirectories(dataDir);
            }

            Path targetFile = dataDir.resolve(fileName);
            String content = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(data);
            Files.writeString(targetFile, content);

            logger.info("数据已保存到文件: {}", targetFile.toAbsolutePath());
            return Result.success(true, "数据保存成功");
        } catch (IOException e) {
            logger.error("保存数据文件失败: {}", fileName, e);
            return Result.error("保存数据文件失败: " + e.getMessage());
        }
    }
}
