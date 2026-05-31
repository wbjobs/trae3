package com.specimen.storage.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.storage.dto.FileInfoVO;
import com.specimen.storage.dto.FileUploadVO;
import io.minio.messages.Part;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import java.util.Map;

public interface StorageFileService {
    FileUploadVO uploadFile(MultipartFile file);
    List<FileUploadVO> batchUpload(List<MultipartFile> files);
    FileInfoVO getFileInfo(Long id);
    void deleteFile(Long id);
    Page<FileInfoVO> fileList(Integer page, Integer size, String keyword);
    Map<String, Object> initMultipartUpload(String originalName, Long fileSize, Integer partCount);
    Map<String, Object> uploadPart(String uploadId, Integer partNumber, MultipartFile file);
    FileUploadVO completeMultipartUpload(String uploadId, String originalName, List<Part> parts);
}
