package com.specimen.traceability.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.specimen.traceability.dto.QrCodeGenerateDTO;
import com.specimen.traceability.dto.ScanRecordDTO;
import com.specimen.traceability.entity.TraceabilityQrCode;
import com.specimen.traceability.mapper.TraceabilityQrCodeMapper;
import com.specimen.traceability.service.QrCodeService;
import com.specimen.traceability.vo.QrCodeVO;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class QrCodeServiceImpl extends ServiceImpl<TraceabilityQrCodeMapper, TraceabilityQrCode> implements QrCodeService {

    @Override
    public QrCodeVO generateQrCode(QrCodeGenerateDTO generateDTO) {
        LambdaQueryWrapper<TraceabilityQrCode> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TraceabilityQrCode::getSpecimenId, generateDTO.getSpecimenId())
                .eq(TraceabilityQrCode::getStatus, 1);
        TraceabilityQrCode existingQrCode = getOne(wrapper);
        if (existingQrCode != null) {
            return convertToVO(existingQrCode, generateDTO.getWidth(), generateDTO.getHeight(), generateDTO.getFormat());
        }

        String qrCodeContent = UUID.randomUUID().toString().replace("-", "") + "_" + generateDTO.getSpecimenId();

        TraceabilityQrCode qrCode = new TraceabilityQrCode();
        qrCode.setSpecimenId(generateDTO.getSpecimenId());
        qrCode.setQrCodeContent(qrCodeContent);
        qrCode.setQrCodeUrl("/traceability/qrcode/image/" + generateDTO.getSpecimenId());
        qrCode.setScanCount(0);
        qrCode.setExpireTime(generateDTO.getExpireTime());
        qrCode.setStatus(1);
        save(qrCode);

        return convertToVO(qrCode, generateDTO.getWidth(), generateDTO.getHeight(), generateDTO.getFormat());
    }

    @Override
    public QrCodeVO getQrCodeById(Long id) {
        TraceabilityQrCode qrCode = getById(id);
        if (qrCode == null) {
            return null;
        }
        return convertToVO(qrCode, 300, 300, "PNG");
    }

    @Override
    public QrCodeVO getQrCodeBySpecimenId(Long specimenId) {
        LambdaQueryWrapper<TraceabilityQrCode> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TraceabilityQrCode::getSpecimenId, specimenId)
                .eq(TraceabilityQrCode::getStatus, 1);
        TraceabilityQrCode qrCode = getOne(wrapper);
        if (qrCode == null) {
            return null;
        }
        return convertToVO(qrCode, 300, 300, "PNG");
    }

    @Override
    public void recordScan(ScanRecordDTO scanDTO) {
        TraceabilityQrCode qrCode = getById(scanDTO.getQrCodeId());
        if (qrCode != null) {
            qrCode.setScanCount(qrCode.getScanCount() + 1);
            qrCode.setLastScanTime(scanDTO.getScanTime() != null ? scanDTO.getScanTime() : LocalDateTime.now());
            updateById(qrCode);
        }
    }

    @Override
    public IPage<QrCodeVO> getQrCodePage(Integer pageNum, Integer pageSize) {
        Page<TraceabilityQrCode> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<TraceabilityQrCode> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(TraceabilityQrCode::getCreateTime);
        IPage<TraceabilityQrCode> qrCodePage = page(page, wrapper);

        IPage<QrCodeVO> voPage = new Page<>(qrCodePage.getCurrent(), qrCodePage.getSize(), qrCodePage.getTotal());
        voPage.setRecords(qrCodePage.getRecords().stream()
                .map(qrCode -> convertToVO(qrCode, 300, 300, "PNG"))
                .collect(java.util.stream.Collectors.toList()));
        return voPage;
    }

    @Override
    public void deleteQrCode(Long id) {
        TraceabilityQrCode qrCode = getById(id);
        if (qrCode != null) {
            qrCode.setStatus(0);
            updateById(qrCode);
        }
    }

    @Override
    public byte[] getQrCodeImage(Long id) {
        TraceabilityQrCode qrCode = getById(id);
        if (qrCode == null) {
            throw new RuntimeException("二维码不存在");
        }
        return generateQrCodeImage(qrCode.getQrCodeContent(), 300, 300, "PNG");
    }

    private byte[] generateQrCodeImage(String content, int width, int height, String format) {
        try {
            Map<EncodeHintType, Object> hints = new HashMap<>();
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            hints.put(EncodeHintType.MARGIN, 1);

            BitMatrix bitMatrix = new MultiFormatWriter().encode(content, BarcodeFormat.QR_CODE, width, height, hints);
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(bitMatrix, format, outputStream);
            return outputStream.toByteArray();
        } catch (WriterException | IOException e) {
            throw new RuntimeException("生成二维码失败", e);
        }
    }

    private QrCodeVO convertToVO(TraceabilityQrCode qrCode, int width, int height, String format) {
        QrCodeVO vo = new QrCodeVO();
        BeanUtils.copyProperties(qrCode, vo);
        byte[] imageBytes = generateQrCodeImage(qrCode.getQrCodeContent(), width, height, format);
        vo.setQrCodeImageBase64(Base64.getEncoder().encodeToString(imageBytes));
        return vo;
    }
}
