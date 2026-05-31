package com.ancient.platform.project.websocket;

import com.ancient.platform.common.entity.NotificationMessage;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final SimpMessagingTemplate messagingTemplate;
    private final RedisTemplate<String, Object> redisTemplate;

    @Value("${notification.batch.enabled:true}")
    private boolean batchEnabled;

    @Value("${notification.batch.interval:1000}")
    private long batchInterval;

    private static final String DUPLICATE_CHECK_KEY = "notification:duplicate:";
    private static final String ONLINE_USERS_KEY = "project:online:users:";
    private static final long DUPLICATE_WINDOW = 10;

    private final BlockingQueue<NotificationMessage> messageQueue = new LinkedBlockingQueue<>();
    private final Map<String, List<NotificationMessage>> batchMap = new ConcurrentHashMap<>();
    private ScheduledExecutorService scheduler;
    private ScheduledFuture<?> batchTask;

    @PostConstruct
    public void init() {
        scheduler = Executors.newScheduledThreadPool(2);
        if (batchEnabled) {
            batchTask = scheduler.scheduleAtFixedRate(
                    this::processBatchMessages,
                    batchInterval,
                    batchInterval,
                    TimeUnit.MILLISECONDS
            );
            log.info("通知批量投递已启用, 间隔: {}ms", batchInterval);
        }

        scheduler.submit(this::processMessageQueue);
    }

    @PreDestroy
    public void destroy() {
        if (batchTask != null) {
            batchTask.cancel(true);
        }
        if (scheduler != null) {
            scheduler.shutdown();
            try {
                if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                    scheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                scheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        log.info("通知服务已关闭");
    }

    private void processMessageQueue() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                NotificationMessage message = messageQueue.take();
                if (batchEnabled) {
                    addToBatch(message);
                } else {
                    sendMessageImmediately(message);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.debug("消息处理线程被中断");
                break;
            } catch (Exception e) {
                log.error("处理消息队列异常", e);
            }
        }
    }

    private void addToBatch(NotificationMessage message) {
        String batchKey = message.getProjectId() + ":" + message.getType();
        batchMap.compute(batchKey, (key, list) -> {
            if (list == null) {
                list = new ArrayList<>();
            }
            list.add(message);
            return list;
        });
    }

    private void processBatchMessages() {
        if (batchMap.isEmpty()) {
            return;
        }

        Set<Map.Entry<String, List<NotificationMessage>>> entries = new HashSet<>(batchMap.entrySet());
        batchMap.clear();

        for (Map.Entry<String, List<NotificationMessage>> entry : entries) {
            List<NotificationMessage> messages = entry.getValue();
            if (messages.isEmpty()) {
                continue;
            }

            if (messages.size() == 1) {
                sendMessageImmediately(messages.get(0));
            } else {
                sendMergedNotification(messages);
            }
        }
    }

    private void sendMergedNotification(List<NotificationMessage> messages) {
        NotificationMessage first = messages.get(0);
        int count = messages.size();

        String mergedContent = count + "条新通知";
        if (count == 2) {
            mergedContent = messages.get(0).getContent() + " 和 " + messages.get(1).getContent();
        } else if (count > 2) {
            mergedContent = messages.get(0).getContent() + " 等" + count + "条通知";
        }

        NotificationMessage mergedMessage = NotificationMessage.builder()
                .id(UUID.randomUUID().toString())
                .type(first.getType())
                .typeName(first.getTypeName())
                .projectId(first.getProjectId())
                .pageId(first.getPageId())
                .title(first.getTitle())
                .content(mergedContent)
                .senderId(first.getSenderId())
                .senderName(first.getSenderName())
                .sendTime(LocalDateTime.now())
                .extraData("{\"batchSize\":" + count + "}")
                .build();

        Set<Long> allReceivers = new HashSet<>();
        for (NotificationMessage msg : messages) {
            if (msg.getReceiverIds() != null) {
                allReceivers.addAll(Arrays.asList(msg.getReceiverIds()));
            }
        }
        mergedMessage.setReceiverIds(allReceivers.toArray(new Long[0]));

        sendMessageImmediately(mergedMessage);
        log.debug("合并发送通知, 原数量: {}, 项目: {}", count, first.getProjectId());
    }

    private boolean isDuplicate(NotificationMessage message) {
        String contentHash = String.valueOf(Objects.hash(
                message.getType(),
                message.getProjectId(),
                message.getPageId(),
                message.getContent()
        ));

        String key = DUPLICATE_CHECK_KEY + contentHash;
        Boolean isNew = redisTemplate.opsForValue().setIfAbsent(key, "1", DUPLICATE_WINDOW, TimeUnit.SECONDS);
        return isNew == null || !isNew;
    }

    private Long[] filterOnlineUsers(Long projectId, Long[] userIds) {
        if (userIds == null || userIds.length == 0) {
            return userIds;
        }

        String onlineKey = ONLINE_USERS_KEY + projectId;
        Set<Object> onlineUsers = redisTemplate.opsForSet().members(onlineKey);

        if (onlineUsers == null || onlineUsers.isEmpty()) {
            return new Long[0];
        }

        List<Long> onlineReceivers = new ArrayList<>();
        for (Long userId : userIds) {
            if (userId != null && onlineUsers.contains(userId.toString())) {
                onlineReceivers.add(userId);
            }
        }

        return onlineReceivers.toArray(new Long[0]);
    }

    private void sendMessageImmediately(NotificationMessage message) {
        if (isDuplicate(message)) {
            log.debug("检测到重复通知, 已跳过: {}", message.getContent());
            return;
        }

        Long[] originalReceivers = message.getReceiverIds();
        if (message.getProjectId() != null) {
            Long[] onlineReceivers = filterOnlineUsers(message.getProjectId(), originalReceivers);
            message.setReceiverIds(onlineReceivers);
        }

        sendToProject(message.getProjectId(), message);
        sendToUsers(message.getReceiverIds(), message);

        message.setReceiverIds(originalReceivers);
    }

    public void sendAnnotationNotification(Long projectId, Long pageId, String annotationId,
                                           Long senderId, String senderName, String content, Long[] receiverIds) {
        NotificationMessage message = NotificationMessage.builder()
                .id(UUID.randomUUID().toString())
                .type(1)
                .typeName("新批注")
                .projectId(projectId)
                .pageId(pageId)
                .businessId(annotationId)
                .title("新批注通知")
                .content(senderName + " 发表了批注: " + truncate(content, 50))
                .senderId(senderId)
                .senderName(senderName)
                .receiverIds(receiverIds)
                .sendTime(LocalDateTime.now())
                .build();

        enqueueMessage(message);
    }

    public void sendAnnotationReplyNotification(Long projectId, Long pageId, String annotationId,
                                                Long senderId, String senderName, String content, Long[] receiverIds) {
        NotificationMessage message = NotificationMessage.builder()
                .id(UUID.randomUUID().toString())
                .type(2)
                .typeName("批注回复")
                .projectId(projectId)
                .pageId(pageId)
                .businessId(annotationId)
                .title("批注回复通知")
                .content(senderName + " 回复了批注: " + truncate(content, 50))
                .senderId(senderId)
                .senderName(senderName)
                .receiverIds(receiverIds)
                .sendTime(LocalDateTime.now())
                .build();

        enqueueMessage(message);
    }

    public void sendCollationSubmitNotification(Long projectId, Long pageId, Long recordId,
                                                Integer pageNumber, Long senderId, String senderName, Long[] receiverIds) {
        NotificationMessage message = NotificationMessage.builder()
                .id(UUID.randomUUID().toString())
                .type(3)
                .typeName("勘校提交")
                .projectId(projectId)
                .pageId(pageId)
                .businessId(String.valueOf(recordId))
                .title("勘校提交通知")
                .content(senderName + " 提交了第 " + pageNumber + " 页的勘校")
                .senderId(senderId)
                .senderName(senderName)
                .receiverIds(receiverIds)
                .sendTime(LocalDateTime.now())
                .build();

        enqueueMessage(message);
    }

    public void sendCollationConflictNotification(Long projectId, Long pageId, Long recordId,
                                                  Integer pageNumber, Long senderId, String senderName,
                                                  String conflictDesc, Long[] receiverIds) {
        NotificationMessage message = NotificationMessage.builder()
                .id(UUID.randomUUID().toString())
                .type(4)
                .typeName("勘校冲突")
                .projectId(projectId)
                .pageId(pageId)
                .businessId(String.valueOf(recordId))
                .title("勘校冲突警告")
                .content("第 " + (pageNumber != null ? pageNumber : "") + " 页存在勘校冲突: " + truncate(conflictDesc, 50))
                .senderId(senderId)
                .senderName(senderName)
                .receiverIds(receiverIds)
                .sendTime(LocalDateTime.now())
                .extraData("{\"conflict\":true}")
                .build();

        sendMessageImmediately(message);
    }

    public void sendPageStatusChangeNotification(Long projectId, Long pageId, Integer pageNumber,
                                                 Integer oldStatus, Integer newStatus,
                                                 Long operatorId, String operatorName, Long[] receiverIds) {
        NotificationMessage message = NotificationMessage.builder()
                .id(UUID.randomUUID().toString())
                .type(5)
                .typeName("状态变更")
                .projectId(projectId)
                .pageId(pageId)
                .businessId(String.valueOf(pageId))
                .title("页面状态变更")
                .content(operatorName + " 将第 " + pageNumber + " 页状态从 " +
                        getStatusName(oldStatus) + " 变更为 " + getStatusName(newStatus))
                .senderId(operatorId)
                .senderName(operatorName)
                .receiverIds(receiverIds)
                .sendTime(LocalDateTime.now())
                .build();

        enqueueMessage(message);
    }

    private void enqueueMessage(NotificationMessage message) {
        try {
            messageQueue.offer(message, 5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("消息入队被中断", e);
        }
    }

    public void sendToProject(Long projectId, NotificationMessage message) {
        if (projectId == null) {
            return;
        }
        String destination = "/topic/project/" + projectId;
        try {
            messagingTemplate.convertAndSend(destination, message);
            log.debug("发送项目通知成功, destination: {}, message: {}", destination, message);
        } catch (Exception e) {
            log.error("发送项目通知失败, destination: {}, message: {}", destination, message, e);
        }
    }

    public void sendToUsers(Long[] userIds, NotificationMessage message) {
        if (userIds == null || userIds.length == 0) {
            return;
        }
        for (Long userId : userIds) {
            if (userId == null) {
                continue;
            }
            String destination = "/queue/notification";
            try {
                messagingTemplate.convertAndSendToUser(String.valueOf(userId), destination, message);
                log.debug("发送用户通知成功, userId: {}, destination: {}, message: {}", userId, destination, message);
            } catch (Exception e) {
                log.error("发送用户通知失败, userId: {}, destination: {}, message: {}", userId, destination, message, e);
            }
        }
    }

    private String truncate(String content, int maxLength) {
        if (content == null || content.length() <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength) + "...";
    }

    private String getStatusName(Integer status) {
        return switch (status) {
            case 0 -> "待分配";
            case 1 -> "分配中";
            case 2 -> "勘校中";
            case 3 -> "待审核";
            case 4 -> "已完成";
            default -> "未知";
        };
    }
}
