package com.research.sample.business.controller;

import com.research.sample.auth.context.TenantContext;
import com.research.sample.business.dto.BatchImportResult;
import com.research.sample.business.dto.SampleQueryRequest;
import com.research.sample.business.entity.SampleMetadata;
import com.research.sample.business.service.SampleBatchService;
import com.research.sample.common.util.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/api/samples/batch")
@RequiredArgsConstructor
public class SampleBatchController {

    private final SampleBatchService sampleBatchService;

    @PostMapping("/import")
    public ApiResponse<BatchImportResult> importSamples(@RequestParam("file") MultipartFile file) {
        BatchImportResult result = sampleBatchService.importMultipart(file);
        return ApiResponse.success(result);
    }

    @PostMapping("/export")
    public ResponseEntity<Resource> exportSamples(@RequestBody SampleQueryRequest request) throws IOException {
        Long tenantId = TenantContext.getTenantId();
        List<SampleMetadata> samples = sampleBatchService.exportSamples(request, tenantId);

        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("样本数据");

            Row headerRow = sheet.createRow(0);
            String[] headers = {"样本编号", "样本名称", "样本类型", "来源", "采集日期", "存储位置", "体积", "单位", "描述", "部门", "状态"};
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
            }

            DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
            int rowNum = 1;
            for (SampleMetadata sample : samples) {
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(sample.getSampleCode());
                row.createCell(1).setCellValue(sample.getSampleName());
                row.createCell(2).setCellValue(sample.getSampleType());
                row.createCell(3).setCellValue(sample.getSource());
                if (sample.getCollectionDate() != null) {
                    row.createCell(4).setCellValue(sample.getCollectionDate().format(dateFormatter));
                }
                row.createCell(5).setCellValue(sample.getStorageLocation());
                if (sample.getVolume() != null) {
                    row.createCell(6).setCellValue(sample.getVolume().doubleValue());
                }
                row.createCell(7).setCellValue(sample.getUnit());
                row.createCell(8).setCellValue(sample.getDescription());
                row.createCell(9).setCellValue(sample.getDepartment());
                row.createCell(10).setCellValue(sample.getStatus());
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            workbook.write(outputStream);
            byte[] bytes = outputStream.toByteArray();

            ByteArrayResource resource = new ByteArrayResource(bytes);
            HttpHeaders headers2 = new HttpHeaders();
            headers2.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=samples.xlsx");

            return ResponseEntity.ok()
                    .headers(headers2)
                    .contentLength(bytes.length)
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(resource);
        }
    }

    @GetMapping("/template")
    public ResponseEntity<Resource> downloadTemplate() throws IOException {
        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("导入模板");

            Row headerRow = sheet.createRow(0);
            String[] headers = {"样本编号", "样本名称", "样本类型", "来源", "采集日期", "存储位置", "体积", "单位", "描述", "部门"};
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
            }

            Row exampleRow = sheet.createRow(1);
            exampleRow.createCell(0).setCellValue("S001");
            exampleRow.createCell(1).setCellValue("示例样本");
            exampleRow.createCell(2).setCellValue("血液");
            exampleRow.createCell(3).setCellValue("门诊");
            exampleRow.createCell(4).setCellValue("2024-01-01");
            exampleRow.createCell(5).setCellValue("A-01-01");
            exampleRow.createCell(6).setCellValue(10.5);
            exampleRow.createCell(7).setCellValue("ml");
            exampleRow.createCell(8).setCellValue("示例描述");
            exampleRow.createCell(9).setCellValue("检验科");

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            workbook.write(outputStream);
            byte[] bytes = outputStream.toByteArray();

            ByteArrayResource resource = new ByteArrayResource(bytes);
            HttpHeaders headers2 = new HttpHeaders();
            headers2.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=import_template.xlsx");

            return ResponseEntity.ok()
                    .headers(headers2)
                    .contentLength(bytes.length)
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(resource);
        }
    }
}
