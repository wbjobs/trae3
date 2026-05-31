package com.ancient.platform.project.service;

import com.ancient.platform.project.dto.request.BatchAnnotationUpdateRequest;
import com.ancient.platform.project.dto.request.BatchPageStatusRequest;
import com.ancient.platform.project.entity.AncientPage;
import com.ancient.platform.project.entity.ProjectMember;
import com.ancient.platform.project.entity.mongo.Annotation;
import com.ancient.platform.project.mapper.AncientPageMapper;
import com.ancient.platform.project.mapper.ProjectMemberMapper;
import com.ancient.platform.project.repository.AnnotationRepository;
import com.ancient.platform.project.websocket.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CollaborationOptimizationService {

    private final AncientPageMapper ancientPageMapper;
    private final ProjectMemberMapper projectMemberMapper;
    private final AnnotationRepository annotationRepository;
    private final MongoTemplate mongoTemplate;
    private final RedisTemplate<String, Object> redisTemplate;
    private final NotificationService notificationService;

    private static final String ONLINE_USERS_KEY = "project:online:users:";
    private static final String USER_WORKLOAD_KEY = "user:workload:";
    private static final String NOTIFICATION_QUEUE_KEY = "notification:queue:";
    private static final long ONLINE_TIMEOUT = 5;

    @Transactional(rollbackFor = Exception.class)
    public void batchUpdateAnnotations(BatchAnnotationUpdateRequest request) {
        if (request.getAnnotationIds() == null || request.getAnnotationIds().isEmpty()) {
            return;
        }

        log.info("批量更新批注, count={}, status={}", request.getAnnotationIds().size(), request.getStatus());

        Query query = new Query(Criteria.where("_id").in(request.getAnnotationIds()));
        Update update = new Update()
                .set("status", request.getStatus())
                .set("updateTime", LocalDateTime.now());

        if (request.getContent() != null) {
            update.set("content", request.getContent());
        }

        mongoTemplate.updateMulti(query, update, Annotation.class);

        log.debug("批量更新批注完成, count={}", request.getAnnotationIds().size());
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchUpdatePageStatus(BatchPageStatusRequest request) {
        if (request.getPageIds() == null || request.getPageIds().isEmpty()) {
            return;
        }

        log.info("批量更新页面状态, count={}, status={}", request.getPageIds().size(), request.getStatus());

        ancientPageMapper.batchUpdatePageStatus(request.getPageIds(), request.getStatus());

        List<AncientPage> updatedPages = ancientPageMapper.selectBatchIds(request.getPageIds());
        for (AncientPage page : updatedPages) {
            notificationService.sendPageStatusChangeNotification(
                    page.getProjectId(), page.getId(), page.getPageNumber(),
                    null, request.getStatus(), request.getOperatorId(),
                    "系统", new Long[]{});
        }

        log.debug("批量更新页面状态完成, count={}", request.getPageIds().size());
    }

    public void optimizeNotificationDelivery(Long projectId, Runnable notificationTask) {
        String queueKey = NOTIFICATION_QUEUE_KEY + projectId;
        Long queueSize = redisTemplate.opsForList().size(queueKey);

        if (queueSize != null && queueSize > 0) {
            redisTemplate.opsForList().rightPush(queueKey, notificationTask);
        } else {
            notificationTask.run();
            redisTemplate.opsForList().rightPush(queueKey, "processing");
            redisTemplate.expire(queueKey, 1, TimeUnit.SECONDS);
        }
    }

    public List<Map<String, Object>> getOnlineUsers(Long projectId) {
        String key = ONLINE_USERS_KEY + projectId;
        Set<Object> userIds = redisTemplate.opsForSet().members(key);

        if (userIds == null || userIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> userIdList = userIds.stream()
                .map(id -> Long.valueOf(id.toString()))
                .toList();

        List<ProjectMember> members = projectMemberMapper.selectMembersByProjectId(projectId);
        Map<Long, ProjectMember> memberMap = members.stream()
                .collect(Collectors.toMap(ProjectMember::getUserId, m -> m));

        List<Map<String, Object>> result = new ArrayList<>();
        for (Long userId : userIdList) {
            Map<String, Object> userInfo = new HashMap<>();
            userInfo.put("userId", userId);

            ProjectMember member = memberMap.get(userId);
            if (member != null) {
                userInfo.put("role", member.getRole());
                userInfo.put("roleName", getRoleName(member.getRole()));
                userInfo.put("joinTime", member.getJoinTime());
            }

            String lastActiveKey = "user:last:active:" + userId;
            Object lastActive = redisTemplate.opsForValue().get(lastActiveKey);
            userInfo.put("lastActiveTime", lastActive);

            result.add(userInfo);
        }

        return result;
    }

    public Map<String, Object> getUserWorkload(Long userId) {
        Map<String, Object> workload = new HashMap<>();

        String cacheKey = USER_WORKLOAD_KEY + userId;
        Object cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return (Map<String, Object>) cached;
        }

        List<AncientPage> assignedPages = ancientPageMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AncientPage>()
                        .eq(AncientPage::getCurrentCollatorId, userId)
                        .eq(AncientPage::getDeleted, 0)
                        .in(AncientPage::getStatus, 1, 2)
        );

        List<AncientPage> completedPages = ancientPageMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AncientPage>()
                        .eq(AncientPage::getLastEditorId, userId)
                        .eq(AncientPage::getDeleted, 0)
                        .eq(AncientPage::getStatus, 4)
        );

        int assignedCount = assignedPages.size();
        int inProgressCount = (int) assignedPages.stream().filter(p -> p.getStatus() == 2).count();
        int completedCount = completedPages.size();

        List<ProjectMember> memberships = projectMemberMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProjectMember>()
                        .eq(ProjectMember::getUserId, userId)
                        .eq(ProjectMember::getStatus, 0)
                        .eq(ProjectMember::getDeleted, 0)
        );

        int totalCollatedChars = memberships.stream()
                .mapToInt(m -> m.getTotalCollatedChars() != null ? m.getTotalCollatedChars().intValue() : 0)
                .sum();

        workload.put("userId", userId);
        workload.put("assignedPages", assignedCount);
        workload.put("inProgressPages", inProgressCount);
        workload.put("completedPages", completedCount);
        workload.put("totalCollatedChars", totalCollatedChars);
        workload.put("projectCount", memberships.size());
        workload.put("workloadLevel", calculateWorkloadLevel(assignedCount, inProgressCount));

        redisTemplate.opsForValue().set(cacheKey, workload, 30, TimeUnit.SECONDS);

        return workload;
    }

    public void updateUserOnlineStatus(Long projectId, Long userId, boolean isOnline) {
        String key = ONLINE_USERS_KEY + projectId;
        if (isOnline) {
            redisTemplate.opsForSet().add(key, userId);
            String lastActiveKey = "user:last:active:" + userId;
            redisTemplate.opsForValue().set(lastActiveKey, LocalDateTime.now(), ONLINE_TIMEOUT, TimeUnit.MINUTES);
        } else {
            redisTemplate.opsForSet().remove(key, userId);
        }
    }

    public Map<String, Object> getSystemMetrics() {
        Map<String, Object> metrics = new HashMap<>();

        long totalPages = ancientPageMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AncientPage>()
                        .eq(AncientPage::getDeleted, 0)
        );

        long collatingPages = ancientPageMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AncientPage>()
                        .eq(AncientPage::getStatus, 2)
                        .eq(AncientPage::getDeleted, 0)
        );

        long completedPages = ancientPageMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AncientPage>()
                        .eq(AncientPage::getStatus, 4)
                        .eq(AncientPage::getDeleted, 0)
        );

        long pendingPages = ancientPageMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AncientPage>()
                        .eq(AncientPage::getStatus, 0)
                        .eq(AncientPage::getDeleted, 0)
        );

        long totalAnnotations = annotationRepository.count();

        metrics.put("totalPages", totalPages);
        metrics.put("collatingPages", collatingPages);
        metrics.put("completedPages", completedPages);
        metrics.put("pendingPages", pendingPages);
        metrics.put("totalAnnotations", totalAnnotations);
        metrics.put("completionRate", totalPages > 0
                ? Math.round(completedPages * 10000.0 / totalPages) / 100.0
                : 0.0);

        return metrics;
    }

    private String getRoleName(Integer role) {
        return switch (role) {
            case 0 -> "创建者";
            case 1 -> "管理员";
            case 2 -> "勘校员";
            case 3 -> "审核员";
            case 4 -> "观察员";
            default -> "未知";
        };
    }

    private String calculateWorkloadLevel(int assignedCount, int inProgressCount) {
        int total = assignedCount + inProgressCount;
        if (total == 0) {
            return "空闲";
        } else if (total <= 3) {
            return "轻松";
        } else if (total <= 8) {
            return "正常";
        } else if (total <= 15) {
            return "繁忙";
        } else {
            return "过载";
        }
    }
}
