package com.ancient.platform.project.service;

import com.ancient.platform.project.dto.request.AnnotationCreateRequest;
import com.ancient.platform.project.dto.response.AnnotationVO;
import com.ancient.platform.project.entity.mongo.Annotation;
import com.ancient.platform.project.entity.mongo.AnnotationReply;
import com.ancient.platform.project.repository.AnnotationRepository;
import com.ancient.platform.project.websocket.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnnotationService {

    private final AnnotationRepository annotationRepository;
    private final NotificationService notificationService;

    public AnnotationVO createAnnotation(AnnotationCreateRequest request) {
        Annotation annotation = Annotation.builder()
                .id(UUID.randomUUID().toString())
                .projectId(request.getProjectId())
                .pageId(request.getPageId())
                .content(request.getContent())
                .type(request.getType())
                .startPosition(request.getStartPosition())
                .endPosition(request.getEndPosition())
                .selectedText(request.getSelectedText())
                .userId(request.getUserId())
                .userName(request.getUserName())
                .status(0)
                .replies(new ArrayList<>())
                .build();
        annotationRepository.save(annotation);

        notificationService.sendAnnotationNotification(
                request.getProjectId(), request.getPageId(), annotation.getId(),
                request.getUserId(), request.getUserName(), request.getContent(), new Long[]{});

        return convertToVO(annotation);
    }

    public AnnotationVO updateAnnotation(String id, String content) {
        Annotation annotation = annotationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("批注不存在"));
        annotation.setContent(content);
        annotationRepository.save(annotation);
        return convertToVO(annotation);
    }

    public void deleteAnnotation(String id) {
        Annotation annotation = annotationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("批注不存在"));
        annotationRepository.delete(annotation);
    }

    public List<AnnotationVO> getAnnotationsByProject(Long projectId) {
        List<Annotation> annotations = annotationRepository.findByProjectIdOrderByCreateTimeDesc(projectId);
        return annotations.stream().map(this::convertToVO).toList();
    }

    public List<AnnotationVO> getAnnotationsByPage(Long projectId, Long pageId) {
        List<Annotation> annotations = annotationRepository.findByProjectIdAndPageIdOrderByCreateTimeDesc(projectId, pageId);
        return annotations.stream().map(this::convertToVO).toList();
    }

    public AnnotationVO addReply(String annotationId, Long userId, String userName, String content) {
        Annotation annotation = annotationRepository.findById(annotationId)
                .orElseThrow(() -> new RuntimeException("批注不存在"));

        AnnotationReply reply = AnnotationReply.builder()
                .id(UUID.randomUUID().toString())
                .userId(userId)
                .userName(userName)
                .content(content)
                .createTime(LocalDateTime.now())
                .build();

        annotation.getReplies().add(reply);
        annotationRepository.save(annotation);

        notificationService.sendAnnotationReplyNotification(
                annotation.getProjectId(), annotation.getPageId(), annotationId,
                userId, userName, content, new Long[]{annotation.getUserId()});

        return convertToVO(annotation);
    }

    public AnnotationVO updateStatus(String id, Integer status) {
        Annotation annotation = annotationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("批注不存在"));
        annotation.setStatus(status);
        annotationRepository.save(annotation);
        return convertToVO(annotation);
    }

    public List<AnnotationVO> getMentionedAnnotations(Long userId) {
        List<Annotation> allAnnotations = annotationRepository.findByUserIdOrderByCreateTimeDesc(userId);
        return allAnnotations.stream()
                .filter(a -> a.getReplies() != null && a.getReplies().stream()
                        .anyMatch(r -> r.getContent() != null && r.getContent().contains("@" + userId)))
                .map(this::convertToVO)
                .toList();
    }

    private AnnotationVO convertToVO(Annotation annotation) {
        AnnotationVO vo = new AnnotationVO();
        vo.setId(annotation.getId());
        vo.setProjectId(annotation.getProjectId());
        vo.setPageId(annotation.getPageId());
        vo.setContent(annotation.getContent());
        vo.setType(annotation.getType());
        vo.setTypeName(getTypeName(annotation.getType()));
        vo.setStartPosition(annotation.getStartPosition());
        vo.setEndPosition(annotation.getEndPosition());
        vo.setSelectedText(annotation.getSelectedText());
        vo.setUserId(annotation.getUserId());
        vo.setUserName(annotation.getUserName());
        vo.setStatus(annotation.getStatus());
        vo.setCreateTime(annotation.getCreateTime());
        vo.setUpdateTime(annotation.getUpdateTime());

        if (annotation.getReplies() != null) {
            List<AnnotationVO.AnnotationReplyVO> replyVOs = annotation.getReplies().stream().map(reply -> {
                AnnotationVO.AnnotationReplyVO replyVO = new AnnotationVO.AnnotationReplyVO();
                replyVO.setId(reply.getId());
                replyVO.setUserId(reply.getUserId());
                replyVO.setUserName(reply.getUserName());
                replyVO.setContent(reply.getContent());
                replyVO.setCreateTime(reply.getCreateTime());
                return replyVO;
            }).toList();
            vo.setReplies(replyVOs);
        }

        return vo;
    }

    private String getTypeName(Integer type) {
        return switch (type) {
            case 0 -> "普通批注";
            case 1 -> "问题";
            case 2 -> "建议";
            case 3 -> "讨论";
            default -> "未知";
        };
    }
}
