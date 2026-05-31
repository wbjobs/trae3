package com.research.sample.business.service;

import com.research.sample.auth.context.TenantContext;
import com.research.sample.business.dto.BatchImportResult;
import com.research.sample.business.dto.SampleQueryRequest;
import com.research.sample.business.entity.SampleMetadata;
import com.research.sample.business.repository.SampleMetadataRepository;
import com.research.sample.validation.dto.BatchValidationRequest;
import com.research.sample.validation.dto.BatchValidationResult;
import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.service.ValidationService;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SampleBatchService {

    private final SampleMetadataRepository sampleMetadataRepository;
    private final ValidationService validationService;

    @Cacheable(value = "samples", key = "#tenantId + '_' + #request.hashCode()")
    public List<SampleMetadata> exportSamples(SampleQueryRequest request, Long tenantId) {
        Specification<SampleMetadata> spec = buildSpecification(request, tenantId);
        return sampleMetadataRepository.findAll(spec);
    }

    @Transactional
    public BatchImportResult importSamples(List<Map<String, Object>> dataList) {
        long startTime = System.currentTimeMillis();
        BatchImportResult result = new BatchImportResult();
        List<String> errors = new ArrayList<>();
        int successCount = 0;
        int batchSize = 50;
        List<SampleMetadata> batch = new ArrayList<>();
        Long tenantId = TenantContext.getTenantId();
        String userId = TenantContext.getCurrentUserId();

        for (int i = 0; i < dataList.size(); i++) {
            Map<String, Object> rowData = dataList.get(i);
            try {
                SampleMetadata sample = validateAndBuildSample(rowData, tenantId, userId);
                batch.add(sample);
                successCount++;

                if (batch.size() >= batchSize) {
                    sampleMetadataRepository.saveAll(batch);
                    batch.clear();
                }
            } catch (Exception e) {
                errors.add("第" + (i + 2) + "行: " + e.getMessage());
            }
        }

        if (!batch.isEmpty()) {
            sampleMetadataRepository.saveAll(batch);
        }

        result.setTotalCount(dataList.size());
        result.setSuccessCount(successCount);
        result.setFailCount(dataList.size() - successCount);
        result.setErrors(errors);
        result.setElapsedMs(System.currentTimeMillis() - startTime);
        return result;
    }

    public BatchImportResult importMultipart(MultipartFile file) {
        List<Map<String, Object>> dataList = parseExcel(file);
        return importSamples(dataList);
    }

    private List<Map<String, Object>> parseExcel(MultipartFile file) {
        List<Map<String, Object>> dataList = new ArrayList<>();
        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                return dataList;
            }

            List<String> headers = new ArrayList<>();
            for (Cell cell : headerRow) {
                headers.add(getCellValueAsString(cell));
            }

            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                Map<String, Object> rowData = new HashMap<>();
                for (int j = 0; j < headers.size(); j++) {
                    Cell cell = row.getCell(j);
                    rowData.put(headers.get(j), getCellValue(cell));
                }
                dataList.add(rowData);
            }
        } catch (IOException e) {
            throw new RuntimeException("解析Excel文件失败: " + e.getMessage());
        }
        return dataList;
    }

    private Object getCellValue(Cell cell) {
        if (cell == null) return null;
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                if (org.apache.poi.ss.usermodel.DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getDateCellValue().toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
                }
                yield cell.getNumericCellValue();
            }
            case BOOLEAN -> cell.getBooleanCellValue();
            case FORMULA -> cell.getCellFormula();
            default -> null;
        };
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> String.valueOf((long) cell.getNumericCellValue());
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            default -> "";
        };
    }

    private SampleMetadata validateAndBuildSample(Map<String, Object> rowData, Long tenantId, String userId) {
        String sampleCode = getStringValue(rowData, "样本编号");
        String sampleName = getStringValue(rowData, "样本名称");
        String sampleType = getStringValue(rowData, "样本类型");
        String source = getStringValue(rowData, "来源");
        LocalDate collectionDate = getDateValue(rowData, "采集日期");
        String storageLocation = getStringValue(rowData, "存储位置");
        BigDecimal volume = getBigDecimalValue(rowData, "体积");
        String unit = getStringValue(rowData, "单位");
        String description = getStringValue(rowData, "描述");
        String department = getStringValue(rowData, "部门");

        if (sampleCode == null || sampleCode.isEmpty()) {
            throw new RuntimeException("样本编号不能为空");
        }
        if (sampleName == null || sampleName.isEmpty()) {
            throw new RuntimeException("样本名称不能为空");
        }

        BatchValidationRequest validationRequest = new BatchValidationRequest();
        validationRequest.setSampleCode(sampleCode);
        Map<String, Object> fields = new HashMap<>();
        fields.put("sampleCode", sampleCode);
        fields.put("sampleName", sampleName);
        if (volume != null) {
            fields.put("volume", volume);
        }
        validationRequest.setFields(fields);

        BatchValidationResult validationResult = validationService.validateBatch(validationRequest);
        if (!validationResult.isValid()) {
            throw new RuntimeException(buildValidationErrorMessage(validationResult.getResults()));
        }

        if (sampleMetadataRepository.findBySampleCode(sampleCode).isPresent()) {
            throw new RuntimeException("样本编号已存在");
        }

        SampleMetadata sample = new SampleMetadata();
        sample.setSampleCode(sampleCode);
        sample.setSampleName(sampleName);
        sample.setSampleType(sampleType);
        sample.setSource(source);
        sample.setCollectionDate(collectionDate);
        sample.setStorageLocation(storageLocation);
        sample.setVolume(volume);
        sample.setUnit(unit);
        sample.setDescription(description);
        sample.setDepartment(department);
        sample.setTenantId(tenantId);
        sample.setCreatedBy(userId);
        sample.setStatus("ACTIVE");
        return sample;
    }

    private String getStringValue(Map<String, Object> rowData, String key) {
        Object value = rowData.get(key);
        if (value == null) return null;
        return value.toString();
    }

    private LocalDate getDateValue(Map<String, Object> rowData, String key) {
        Object value = rowData.get(key);
        if (value == null) return null;
        if (value instanceof LocalDate) return (LocalDate) value;
        if (value instanceof Date) return ((Date) value).toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        if (value instanceof Number) return LocalDate.ofEpochDay(((Number) value).longValue());
        return null;
    }

    private BigDecimal getBigDecimalValue(Map<String, Object> rowData, String key) {
        Object value = rowData.get(key);
        if (value == null) return null;
        if (value instanceof BigDecimal) return (BigDecimal) value;
        if (value instanceof Number) return BigDecimal.valueOf(((Number) value).doubleValue());
        try {
            return new BigDecimal(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String buildValidationErrorMessage(List<ValidationResult> results) {
        List<String> errors = new ArrayList<>();
        for (ValidationResult result : results) {
            if (!result.isValid()) {
                errors.add(result.getFieldName() + ": " + result.getErrorMessage());
            }
        }
        return String.join("; ", errors);
    }

    private Specification<SampleMetadata> buildSpecification(SampleQueryRequest request, Long tenantId) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("tenantId"), tenantId));
            predicates.add(cb.notEqual(root.get("status"), "DELETED"));
            if (request.getSampleCode() != null && !request.getSampleCode().isEmpty()) {
                predicates.add(cb.like(root.get("sampleCode"), "%" + request.getSampleCode() + "%"));
            }
            if (request.getSampleName() != null && !request.getSampleName().isEmpty()) {
                predicates.add(cb.like(root.get("sampleName"), "%" + request.getSampleName() + "%"));
            }
            if (request.getSampleType() != null && !request.getSampleType().isEmpty()) {
                predicates.add(cb.equal(root.get("sampleType"), request.getSampleType()));
            }
            if (request.getStatus() != null && !request.getStatus().isEmpty()) {
                predicates.add(cb.equal(root.get("status"), request.getStatus()));
            }
            if (request.getDepartment() != null && !request.getDepartment().isEmpty()) {
                predicates.add(cb.equal(root.get("department"), request.getDepartment()));
            }
            if (request.getCollectionDateStart() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("collectionDate"), request.getCollectionDateStart()));
            }
            if (request.getCollectionDateEnd() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("collectionDate"), request.getCollectionDateEnd()));
            }
            query.distinct(true);
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
