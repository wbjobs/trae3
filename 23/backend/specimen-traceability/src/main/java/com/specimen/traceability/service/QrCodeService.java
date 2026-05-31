package com.specimen.traceability.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.specimen.traceability.dto.QrCodeGenerateDTO;
import com.specimen.traceability.dto.ScanRecordDTO;
import com.specimen.traceability.entity.TraceabilityQrCode;
import com.specimen.traceability.vo.QrCodeVO;

public interface QrCodeService extends IService<TraceabilityQrCode> {
    QrCodeVO generateQrCode(QrCodeGenerateDTO generateDTO);
    QrCodeVO getQrCodeById(Long id);
    QrCodeVO getQrCodeBySpecimenId(Long specimenId);
    void recordScan(ScanRecordDTO scanDTO);
    IPage<QrCodeVO> getQrCodePage(Integer pageNum, Integer pageSize);
    void deleteQrCode(Long id);
    byte[] getQrCodeImage(Long id);
}
