package com.research.sample.storage.service;

import com.research.sample.auth.context.TenantContext;
import com.research.sample.common.exception.BusinessException;
import com.research.sample.storage.entity.SampleAttachment;
import com.research.sample.storage.repository.SampleAttachmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AttachmentService {

    private final SampleAttachmentRepository attachmentRepository;
    private final StorageService storageService;

    @Transactional
    public SampleAttachment uploadAttachment(Long sampleId, MultipartFile file) {
        Long tenantId = TenantContext.getCurrentTenantId();
        Long userId = TenantContext.getCurrentUserId();
        
        if (sampleId == null) {
            throw new BusinessException("样本ID不能为空");
        }
        
        if (file == null || file.isEmpty()) {
            throw new BusinessException("文件不能为空");
        }

        String originalFileName = file.getOriginalFilename();
        String uuid = UUID.randomUUID().toString();
        String objectName = tenantId + "/" + sampleId + "/" + uuid + "_" + originalFileName;

        try {
            storageService.uploadFile(objectName, file.getInputStream(), file.getContentType());
        } catch (Exception e) {
            throw new BusinessException("文件上传失败: " + e.getMessage());
        }

        SampleAttachment attachment = new SampleAttachment();
        attachment.setSampleId(sampleId);
        attachment.setFileName(originalFileName);
        attachment.setFilePath(objectName);
        attachment.setFileSize(file.getSize());
        attachment.setContentType(file.getContentType());
        attachment.setStorageType("MINIO");
        attachment.setTenantId(tenantId);
        attachment.setUploadedBy(userId);

        return attachmentRepository.save(attachment);
    }

    public InputStream downloadAttachment(Long attachmentId) {
        Long tenantId = TenantContext.getCurrentTenantId();
        SampleAttachment attachment = attachmentRepository.findByIdAndTenantId(attachmentId, tenantId)
                .orElseThrow(() -> new BusinessException("Attachment not found"));
        return storageService.downloadFile(attachment.getFilePath());
    }

    @Transactional
    public void deleteAttachment(Long attachmentId) {
        Long tenantId = TenantContext.getCurrentTenantId();
        SampleAttachment attachment = attachmentRepository.findByIdAndTenantId(attachmentId, tenantId)
                .orElseThrow(() -> new BusinessException("Attachment not found"));
        storageService.deleteFile(attachment.getFilePath());
        attachmentRepository.deleteByIdAndTenantId(attachmentId, tenantId);
    }

    public String getAttachmentPresignedUrl(Long attachmentId, int minutes) {
        Long tenantId = TenantContext.getCurrentTenantId();
        SampleAttachment attachment = attachmentRepository.findByIdAndTenantId(attachmentId, tenantId)
                .orElseThrow(() -> new BusinessException("Attachment not found"));
        return storageService.getPresignedUrl(attachment.getFilePath(), minutes);
    }

    public List<SampleAttachment> getAttachmentsBySample(Long sampleId) {
        Long tenantId = TenantContext.getCurrentTenantId();
        return attachmentRepository.findBySampleIdAndTenantId(sampleId, tenantId);
    }
}
