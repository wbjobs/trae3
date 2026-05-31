package com.specimen.traceability.controller;

import com.specimen.common.result.Result;
import com.specimen.traceability.dto.QrCodeGenerateDTO;
import com.specimen.traceability.dto.ScanRecordDTO;
import com.specimen.traceability.service.QrCodeService;
import com.specimen.traceability.vo.QrCodeVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

@Tag(name = "二维码管理", description = "二维码生成、查询、扫码")
@RestController
@RequestMapping("/traceability/qrcode")
@RequiredArgsConstructor
public class QrCodeController {

    private final QrCodeService qrCodeService;

    @Operation(summary = "生成二维码")
    @PostMapping("/generate")
    public Result<QrCodeVO> generateQrCode(@RequestBody QrCodeGenerateDTO generateDTO) {
        return Result.success(qrCodeService.generateQrCode(generateDTO));
    }

    @Operation(summary = "根据标本ID获取二维码")
    @GetMapping("/specimen/{specimenId}")
    public Result<QrCodeVO> getQrCodeBySpecimenId(@PathVariable Long specimenId) {
        return Result.success(qrCodeService.getQrCodeBySpecimenId(specimenId));
    }

    @Operation(summary = "获取二维码图片")
    @GetMapping(value = "/image/{id}", produces = MediaType.IMAGE_PNG_VALUE)
    public byte[] getQrCodeImage(@PathVariable Long id) {
        return qrCodeService.getQrCodeImage(id);
    }

    @Operation(summary = "记录扫码")
    @PostMapping("/scan")
    public Result<Void> recordScan(@RequestBody ScanRecordDTO scanDTO) {
        qrCodeService.recordScan(scanDTO);
        return Result.success();
    }

    @Operation(summary = "删除二维码")
    @DeleteMapping("/{id}")
    public Result<Void> deleteQrCode(@PathVariable Long id) {
        qrCodeService.deleteQrCode(id);
        return Result.success();
    }
}
