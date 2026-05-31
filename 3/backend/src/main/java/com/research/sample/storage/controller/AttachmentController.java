package com.research.sample.storage.controller;

import com.research.sample.storage.entity.SampleAttachment;
import com.research.sample.storage.service.AttachmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.List;

@RestController
@RequestMapping("/api/attachments")
@RequiredArgsConstructor
public class AttachmentController {

    private final AttachmentService attachmentService;

    @PostMapping("/upload")
    public SampleAttachment uploadAttachment(
            @RequestParam Long sampleId,
            @RequestParam MultipartFile file) {
        return attachmentService.uploadAttachment(sampleId, file);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> downloadAttachment(@PathVariable Long id) {
        InputStream inputStream = attachmentService.downloadAttachment(id);
        InputStreamResource resource = new InputStreamResource(inputStream);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + id + "\"")
                .body(resource);
    }

    @GetMapping("/{id}/url")
    public String getAttachmentPresignedUrl(
            @PathVariable Long id,
            @RequestParam(defaultValue = "60") int minutes) {
        return attachmentService.getAttachmentPresignedUrl(id, minutes);
    }

    @DeleteMapping("/{id}")
    public void deleteAttachment(@PathVariable Long id) {
        attachmentService.deleteAttachment(id);
    }

    @GetMapping("/sample/{sampleId}")
    public List<SampleAttachment> getAttachmentsBySample(@PathVariable Long sampleId) {
        return attachmentService.getAttachmentsBySample(sampleId);
    }
}
