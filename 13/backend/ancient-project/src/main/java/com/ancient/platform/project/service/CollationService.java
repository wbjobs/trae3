package com.ancient.platform.project.service;

import com.ancient.platform.common.annotation.DistributedLock;
import com.ancient.platform.project.dto.request.CollationSubmitRequest;
import com.ancient.platform.project.dto.request.PageUpdateRequest;
import com.ancient.platform.project.dto.response.AncientPageVO;
import com.ancient.platform.project.dto.response.CollationRecordVO;
import com.ancient.platform.project.entity.AncientPage;
import com.ancient.platform.project.entity.CollationRecord;
import com.ancient.platform.project.entity.mongo.PageSnapshot;
import com.ancient.platform.project.mapper.AncientPageMapper;
import com.ancient.platform.project.mapper.CollationRecordMapper;
import com.ancient.platform.project.repository.AnnotationRepository;
import com.ancient.platform.project.repository.PageSnapshotRepository;
import com.ancient.platform.project.websocket.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CollationService {

    private final AncientPageMapper ancientPageMapper;
    private final CollationRecordMapper collationRecordMapper;
    private final PageSnapshotRepository pageSnapshotRepository;
    private final AnnotationRepository annotationRepository;
    private final TextParserService textParserService;
    private final NotificationService notificationService;

    private static final int MAX_RETRY_TIMES = 3;

    public AncientPageVO getPage(Long id) {
        AncientPage page = ancientPageMapper.selectById(id);
        if (page == null) {
            throw new RuntimeException("书页不存在");
        }
        return convertToVO(page);
    }

    public List<AncientPageVO> listPages(Long projectId) {
        List<AncientPage> pages = ancientPageMapper.selectPagesByProjectId(projectId);
        return pages.stream().map(this::convertToVO).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    @DistributedLock(lockName = "collation:page", key = "#request.pageId")
    public AncientPageVO updatePageText(PageUpdateRequest request) {
        return updatePageTextWithRetry(request, 0);
    }

    private AncientPageVO updatePageTextWithRetry(PageUpdateRequest request, int retryCount) {
        try {
            AncientPage page = ancientPageMapper.selectById(request.getPageId());
            if (page == null) {
                throw new RuntimeException("书页不存在");
            }

            Integer currentVersion = page.getCurrentVersion();
            String beforeText = page.getCollatedText() != null ? page.getCollatedText() : page.getRecognizedText();

            if (request.getCollatedText() != null) {
                page.setCollatedText(request.getCollatedText());
            }
            if (request.getRecognizedText() != null) {
                page.setRecognizedText(request.getRecognizedText());
            }
            if (request.getStatus() != null) {
                page.setStatus(request.getStatus());
            }
            if (request.getCurrentCollatorId() != null) {
                page.setCurrentCollatorId(request.getCurrentCollatorId());
            }
            page.setLastEditTime(LocalDateTime.now());
            page.setLastEditorId(request.getOperatorId());

            int updatedRows = ancientPageMapper.updatePageWithVersion(page);
            if (updatedRows == 0) {
                throw new OptimisticLockingFailureException("页面版本冲突");
            }

            page.setCurrentVersion(currentVersion + 1);

            String afterText = page.getCollatedText() != null ? page.getCollatedText() : page.getRecognizedText();
            String diffContent = textParserService.generateDiff(beforeText, afterText);

            PageSnapshot snapshot = PageSnapshot.builder()
                    .pageId(page.getId())
                    .projectId(page.getProjectId())
                    .version(page.getCurrentVersion())
                    .beforeText(beforeText)
                    .afterText(afterText)
                    .recognizedText(page.getRecognizedText())
                    .collatorId(request.getOperatorId())
                    .changeDescription("文本更新")
                    .diffContent(diffContent)
                    .build();
            pageSnapshotRepository.save(snapshot);

            return convertToVO(page);
        } catch (OptimisticLockingFailureException e) {
            if (retryCount < MAX_RETRY_TIMES - 1) {
                log.warn("更新页面文本发生乐观锁冲突，正在重试，pageId={}, retryCount={}", request.getPageId(), retryCount + 1);
                try {
                    Thread.sleep(100L * (retryCount + 1));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("重试被中断", ie);
                }
                return updatePageTextWithRetry(request, retryCount + 1);
            } else {
                log.error("更新页面文本乐观锁冲突重试次数已达上限，pageId={}", request.getPageId());
                notificationService.sendCollationConflictNotification(
                        null, request.getPageId(), null, null,
                        request.getOperatorId(), "勘校员",
                        "更新页面文本时发生并发冲突，请刷新页面后重试",
                        new Long[]{request.getOperatorId()});
                throw new RuntimeException("页面更新失败，有其他用户正在编辑，请刷新后重试");
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    @DistributedLock(lockName = "collation:submit", key = "#request.pageId", waitTime = 3)
    public CollationRecordVO submitCollation(CollationSubmitRequest request) {
        return submitCollationWithRetry(request, 0);
    }

    private CollationRecordVO submitCollationWithRetry(CollationSubmitRequest request, int retryCount) {
        try {
            AncientPage page = ancientPageMapper.selectById(request.getPageId());
            if (page == null) {
                throw new RuntimeException("书页不存在");
            }

            Integer pageVersion = page.getCurrentVersion();

            Integer latestVersion = collationRecordMapper.getLatestVersion(request.getPageId());
            int newVersion = latestVersion + 1;

            String beforeText = page.getCollatedText() != null ? page.getCollatedText() : page.getRecognizedText();
            String diffContent = textParserService.generateDiff(beforeText, request.getAfterText());

            boolean hasConflict = false;
            String conflictDescription = null;
            if (request.getBaseVersion() < pageVersion) {
                hasConflict = true;
                conflictDescription = "基于版本" + request.getBaseVersion() + "提交，但当前版本已为" + pageVersion;
                log.warn("勘校提交检测到版本冲突，pageId={}, baseVersion={}, currentVersion={}",
                        request.getPageId(), request.getBaseVersion(), pageVersion);
            }

            CollationRecord record = new CollationRecord();
            record.setPageId(request.getPageId());
            record.setProjectId(request.getProjectId());
            record.setVersion(newVersion);
            record.setBeforeText(beforeText);
            record.setAfterText(request.getAfterText());
            record.setChangeDescription(request.getChangeDescription());
            record.setCollatorId(request.getCollatorId());
            record.setCollationType(request.getCollationType());
            record.setStatus(0);
            record.setHasConflict(hasConflict ? 1 : 0);
            record.setConflictDescription(conflictDescription);
            collationRecordMapper.insert(record);

            PageSnapshot snapshot = PageSnapshot.builder()
                    .pageId(request.getPageId())
                    .projectId(request.getProjectId())
                    .version(newVersion)
                    .beforeText(beforeText)
                    .afterText(request.getAfterText())
                    .recognizedText(page.getRecognizedText())
                    .collatorId(request.getCollatorId())
                    .changeDescription(request.getChangeDescription())
                    .diffContent(diffContent)
                    .build();
            pageSnapshotRepository.save(snapshot);

            record.setSnapshotId(snapshot.getId());
            collationRecordMapper.updateById(record);

            page.setCollatedText(request.getAfterText());
            page.setCurrentVersion(pageVersion);
            page.setStatus(3);
            page.setLastEditTime(LocalDateTime.now());
            page.setLastEditorId(request.getCollatorId());

            int updatedRows = ancientPageMapper.updatePageWithVersion(page);
            if (updatedRows == 0) {
                throw new OptimisticLockingFailureException("页面版本冲突");
            }

            page.setCurrentVersion(pageVersion + 1);

            if (hasConflict) {
                notificationService.sendCollationConflictNotification(
                        request.getProjectId(), request.getPageId(), record.getId(),
                        page.getPageNumber(), request.getCollatorId(), "勘校员",
                        conflictDescription, new Long[]{page.getCurrentCollatorId()});
            } else {
                notificationService.sendCollationSubmitNotification(
                        request.getProjectId(), request.getPageId(), record.getId(),
                        page.getPageNumber(), request.getCollatorId(), "勘校员",
                        new Long[]{});
            }

            return convertRecordToVO(record, page.getPageNumber());
        } catch (OptimisticLockingFailureException e) {
            if (retryCount < MAX_RETRY_TIMES - 1) {
                log.warn("提交勘校发生乐观锁冲突，正在重试，pageId={}, retryCount={}", request.getPageId(), retryCount + 1);
                try {
                    Thread.sleep(100L * (retryCount + 1));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("重试被中断", ie);
                }
                return submitCollationWithRetry(request, retryCount + 1);
            } else {
                log.error("提交勘校乐观锁冲突重试次数已达上限，pageId={}", request.getPageId());
                notificationService.sendCollationConflictNotification(
                        request.getProjectId(), request.getPageId(), null, null,
                        request.getCollatorId(), "勘校员",
                        "提交勘校时发生并发冲突，请刷新页面后重试",
                        new Long[]{request.getCollatorId()});
                throw new RuntimeException("提交失败，有其他用户正在编辑，请刷新后重试");
            }
        }
    }

    public List<CollationRecordVO> getPageHistory(Long pageId) {
        List<CollationRecord> records = collationRecordMapper.selectRecordsByPageId(pageId);
        AncientPage page = ancientPageMapper.selectById(pageId);
        Integer pageNumber = page != null ? page.getPageNumber() : null;
        return records.stream().map(r -> convertRecordToVO(r, pageNumber)).toList();
    }

    public Map<String, Object> compareVersions(Long pageId, Integer version1, Integer version2) {
        PageSnapshot snapshot1 = pageSnapshotRepository.findByPageIdAndVersion(pageId, version1)
                .orElseThrow(() -> new RuntimeException("版本" + version1 + "的快照不存在"));
        PageSnapshot snapshot2 = pageSnapshotRepository.findByPageIdAndVersion(pageId, version2)
                .orElseThrow(() -> new RuntimeException("版本" + version2 + "的快照不存在"));

        Map<String, Object> result = new HashMap<>();
        result.put("version1", buildSnapshotMap(snapshot1));
        result.put("version2", buildSnapshotMap(snapshot2));
        result.put("diff", textParserService.generateDiff(snapshot1.getAfterText(), snapshot2.getAfterText()));
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchUpdateStatus(List<Long> pageIds, Integer status) {
        if (pageIds == null || pageIds.isEmpty()) {
            return;
        }
        ancientPageMapper.batchUpdatePageStatus(pageIds, status);
    }

    private AncientPageVO convertToVO(AncientPage page) {
        AncientPageVO vo = new AncientPageVO();
        BeanUtils.copyProperties(page, vo);
        vo.setStatusName(getPageStatusName(page.getStatus()));
        vo.setHasConflict(collationRecordMapper.countConflictRecords(page.getId()) > 0);
        vo.setAnnotationCount((int) annotationRepository.countByPageId(page.getId()));
        return vo;
    }

    private CollationRecordVO convertRecordToVO(CollationRecord record, Integer pageNumber) {
        CollationRecordVO vo = new CollationRecordVO();
        BeanUtils.copyProperties(record, vo);
        vo.setPageNumber(pageNumber);
        vo.setCollationTypeName(getCollationTypeName(record.getCollationType()));
        vo.setStatusName(getRecordStatusName(record.getStatus()));
        vo.setChangedChars(calculateChangedChars(record.getBeforeText(), record.getAfterText()));
        return vo;
    }

    private Map<String, Object> buildSnapshotMap(PageSnapshot snapshot) {
        Map<String, Object> map = new HashMap<>();
        map.put("version", snapshot.getVersion());
        map.put("beforeText", snapshot.getBeforeText());
        map.put("afterText", snapshot.getAfterText());
        map.put("collatorId", snapshot.getCollatorId());
        map.put("changeDescription", snapshot.getChangeDescription());
        map.put("createTime", snapshot.getCreateTime());
        return map;
    }

    private String getPageStatusName(Integer status) {
        return switch (status) {
            case 0 -> "待分配";
            case 1 -> "分配中";
            case 2 -> "勘校中";
            case 3 -> "待审核";
            case 4 -> "已完成";
            default -> "未知";
        };
    }

    private String getCollationTypeName(Integer type) {
        return switch (type) {
            case 0 -> "普通勘校";
            case 1 -> "审核";
            case 2 -> "冲突解决";
            default -> "未知";
        };
    }

    private String getRecordStatusName(Integer status) {
        return switch (status) {
            case 0 -> "待审核";
            case 1 -> "已通过";
            case 2 -> "已驳回";
            default -> "未知";
        };
    }

    private int calculateChangedChars(String before, String after) {
        if (before == null) before = "";
        if (after == null) after = "";
        int maxLen = Math.max(before.length(), after.length());
        int changed = 0;
        for (int i = 0; i < maxLen; i++) {
            if (i >= before.length() || i >= after.length() || before.charAt(i) != after.charAt(i)) {
                changed++;
            }
        }
        return changed;
    }
}
