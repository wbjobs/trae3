package com.specimen.data.controller;

import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.write.style.column.LongestMatchColumnSizeStyleStrategy;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.common.result.Result;
import com.specimen.data.config.CollaborationNotifier;
import com.specimen.data.config.DistributedLock;
import com.specimen.data.dto.AnnotationCreateDTO;
import com.specimen.data.dto.AnnotationBatchCreateDTO;
import com.specimen.data.dto.AnnotationExportDTO;
import com.specimen.data.dto.AnnotationQueryDTO;
import com.specimen.data.entity.SpecimenAnnotation;
import com.specimen.data.service.SpecimenAnnotationService;
import com.specimen.data.service.SpecimenService;
import com.specimen.data.vo.AnnotationVO;
import com.specimen.data.vo.SpecimenVO;
import com.specimen.common.context.TenantContext;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/data/annotation")
@RequiredArgsConstructor
public class AnnotationController {
    private final SpecimenAnnotationService annotationService;
    private final SpecimenService specimenService;
    private final DistributedLock distributedLock;
    private final CollaborationNotifier collaborationNotifier;

    @PostMapping
    public Result<AnnotationVO> create(@RequestBody AnnotationCreateDTO dto) {
        AnnotationVO vo = annotationService.create(dto);
        collaborationNotifier.notifyAnnotationChange(
                TenantContext.getTenantId(), dto.getSpecimenId(), dto.getImageId(),
                "CREATE", TenantContext.getUserId(), TenantContext.getUsername());
        return Result.success(vo);
    }

    @PostMapping("/batch")
    public Result<List<AnnotationVO>> batchCreate(@RequestBody AnnotationBatchCreateDTO dto) {
        List<AnnotationVO> result = annotationService.batchCreate(dto);
        collaborationNotifier.notifyAnnotationChange(
                TenantContext.getTenantId(), dto.getSpecimenId(), dto.getImageId(),
                "BATCH_CREATE", TenantContext.getUserId(), TenantContext.getUsername());
        return Result.success(result);
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        AnnotationVO existing = annotationService.getById(id);
        annotationService.delete(id);
        if (existing != null) {
            collaborationNotifier.notifyAnnotationChange(
                    TenantContext.getTenantId(), existing.getSpecimenId(), existing.getImageId(),
                    "DELETE", TenantContext.getUserId(), TenantContext.getUsername());
        }
        return Result.success();
    }

    @GetMapping("/{id}")
    public Result<AnnotationVO> getById(@PathVariable Long id) {
        return Result.success(annotationService.getById(id));
    }

    @PostMapping("/page")
    public Result<Page<AnnotationVO>> page(@RequestBody AnnotationQueryDTO dto) {
        return Result.success(annotationService.page(dto));
    }

    @GetMapping("/list/{imageId}")
    public Result<List<AnnotationVO>> listByImageId(@PathVariable Long imageId) {
        return Result.success(annotationService.listByImageId(imageId));
    }

    @PostMapping("/lock")
    public Result<Boolean> acquireLock(@RequestBody Map<String, Long> params) {
        Long specimenId = params.get("specimenId");
        Long imageId = params.get("imageId");
        boolean locked = distributedLock.tryLockAnnotation(specimenId, imageId, TenantContext.getUserId());
        return Result.success(locked);
    }

    @PostMapping("/unlock")
    public Result<Void> releaseLock(@RequestBody Map<String, Long> params) {
        Long specimenId = params.get("specimenId");
        Long imageId = params.get("imageId");
        distributedLock.unlockAnnotation(specimenId, imageId, TenantContext.getUserId());
        return Result.success();
    }

    @PostMapping("/export")
    public void exportAnnotations(@RequestBody AnnotationExportDTO dto, HttpServletResponse response) throws IOException {
        List<AnnotationVO> annotations = annotationService.listBySpecimenIds(
                dto.getSpecimenIds() != null ? dto.getSpecimenIds() : List.of());

        if (dto.getSpecimenId() != null) {
            annotations.addAll(annotationService.listByImageId(dto.getSpecimenId()));
        }

        String format = dto.getFormat() != null ? dto.getFormat() : "excel";

        if ("coco".equalsIgnoreCase(format)) {
            exportCocoJson(annotations, response);
        } else {
            exportExcel(annotations, response);
        }
    }

    private void exportExcel(List<AnnotationVO> annotations, HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setCharacterEncoding("utf-8");
        String fileName = URLEncoder.encode("标本标注数据", StandardCharsets.UTF_8).replaceAll("\\+", "%20");
        response.setHeader("Content-Disposition", "attachment; filename=" + fileName + ".xlsx");

        List<List<String>> head = new ArrayList<>();
        head.add(List.of("标注ID"));
        head.add(List.of("标本ID"));
        head.add(List.of("图片ID"));
        head.add(List.of("标注类型"));
        head.add(List.of("标注标签"));
        head.add(List.of("置信度"));
        head.add(List.of("坐标数据"));
        head.add(List.of("颜色"));
        head.add(List.of("备注"));
        head.add(List.of("标注人"));
        head.add(List.of("标注时间"));

        List<List<Object>> data = new ArrayList<>();
        for (AnnotationVO ann : annotations) {
            List<Object> row = new ArrayList<>();
            row.add(ann.getId());
            row.add(ann.getSpecimenId());
            row.add(ann.getImageId());
            row.add(ann.getAnnotationTypeName() != null ? ann.getAnnotationTypeName() : ann.getAnnotationType());
            row.add(ann.getLabel());
            row.add(ann.getConfidence());
            row.add(ann.getCoordinates());
            row.add(ann.getColor());
            row.add(ann.getNote());
            row.add(ann.getAnnotatorName());
            row.add(ann.getAnnotationTime() != null ? ann.getAnnotationTime().toString() : "");
            data.add(row);
        }

        EasyExcel.write(response.getOutputStream())
                .head(head)
                .registerWriteHandler(new LongestMatchColumnSizeStyleStrategy())
                .sheet("标注数据")
                .doWrite(data);
    }

    private void exportCocoJson(List<AnnotationVO> annotations, HttpServletResponse response) throws IOException {
        response.setContentType("application/json");
        response.setCharacterEncoding("utf-8");
        String fileName = URLEncoder.encode("标本标注COCO", StandardCharsets.UTF_8).replaceAll("\\+", "%20");
        response.setHeader("Content-Disposition", "attachment; filename=" + fileName + ".json");

        Map<String, Object> coco = new HashMap<>();
        coco.put("info", Map.of("description", "Specimen Annotation Export", "version", "1.0"));

        List<Map<String, Object>> images = new ArrayList<>();
        List<Map<String, Object>> categories = new ArrayList<>();
        List<Map<String, Object>> cocoAnnotations = new ArrayList<>();

        Map<Long, Integer> imageIdMap = new HashMap<>();
        Map<Integer, Integer> categoryMap = new HashMap<>();
        int imageIdx = 1;
        int catIdx = 1;
        int annIdx = 1;

        for (AnnotationVO ann : annotations) {
            if (!imageIdMap.containsKey(ann.getImageId())) {
                imageIdMap.put(ann.getImageId(), imageIdx);
                images.add(Map.of("id", imageIdx, "file_name", "image_" + ann.getImageId()));
                imageIdx++;
            }

            int catId;
            if (categoryMap.containsKey(ann.getAnnotationType())) {
                catId = categoryMap.get(ann.getAnnotationType());
            } else {
                catId = catIdx;
                categoryMap.put(ann.getAnnotationType(), catIdx);
                categories.add(Map.of("id", catIdx, "name", ann.getAnnotationTypeName() != null ? ann.getAnnotationTypeName() : String.valueOf(ann.getAnnotationType())));
                catIdx++;
            }

            Map<String, Object> cocoAnn = new HashMap<>();
            cocoAnn.put("id", annIdx++);
            cocoAnn.put("image_id", imageIdMap.get(ann.getImageId()));
            cocoAnn.put("category_id", catId);
            cocoAnn.put("annotation_type", ann.getAnnotationType());
            cocoAnn.put("coordinates", ann.getCoordinates() != null ? ann.getCoordinates() : "");
            cocoAnn.put("label", ann.getLabel() != null ? ann.getLabel() : "");
            cocoAnn.put("confidence", ann.getConfidence() != null ? ann.getConfidence().doubleValue() : 0.0);
            cocoAnnotations.add(cocoAnn);
        }

        coco.put("images", images);
        coco.put("categories", categories);
        coco.put("annotations", cocoAnnotations);

        com.alibaba.fastjson2.JSON.writeTo(response.getOutputStream(), coco);
    }
}
