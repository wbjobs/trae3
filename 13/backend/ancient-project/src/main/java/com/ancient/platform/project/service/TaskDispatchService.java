package com.ancient.platform.project.service;

import com.ancient.platform.common.context.UserContextHolder;
import com.ancient.platform.common.entity.NotificationMessage;
import com.ancient.platform.project.dto.request.TaskBatchAssignRequest;
import com.ancient.platform.project.dto.request.TaskCancelRequest;
import com.ancient.platform.project.dto.request.TaskReassignRequest;
import com.ancient.platform.project.dto.response.AncientPageVO;
import com.ancient.platform.project.dto.response.TaskDispatchDetailVO;
import com.ancient.platform.project.dto.response.TaskDispatchVO;
import com.ancient.platform.project.entity.AncientPage;
import com.ancient.platform.project.entity.Project;
import com.ancient.platform.project.entity.ProjectMember;
import com.ancient.platform.project.entity.TaskDispatch;
import com.ancient.platform.project.mapper.AncientPageMapper;
import com.ancient.platform.project.mapper.ProjectMapper;
import com.ancient.platform.project.mapper.ProjectMemberMapper;
import com.ancient.platform.project.mapper.TaskDispatchMapper;
import com.ancient.platform.project.websocket.NotificationService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskDispatchService {

    private final TaskDispatchMapper taskDispatchMapper;
    private final AncientPageMapper ancientPageMapper;
    private final ProjectMapper projectMapper;
    private final ProjectMemberMapper projectMemberMapper;
    private final NotificationService notificationService;

    @Transactional(rollbackFor = Exception.class)
    public TaskDispatchVO batchAssign(TaskBatchAssignRequest request) {
        Long dispatcherId = UserContextHolder.getUserId();
        String dispatcherName = UserContextHolder.getNickname();

        Project project = projectMapper.selectById(request.getProjectId());
        if (project == null) {
            throw new RuntimeException("项目不存在");
        }

        List<Long> pageIds = request.getPageIds();
        List<AncientPage> pages = ancientPageMapper.selectBatchIds(pageIds);
        if (pages.size() != pageIds.size()) {
            throw new RuntimeException("部分页面不存在");
        }

        for (AncientPage page : pages) {
            if (page.getStatus() != 0 && page.getStatus() != 1) {
                throw new RuntimeException("页面 " + page.getPageNumber() + " 状态不允许分配");
            }
            if (!page.getProjectId().equals(request.getProjectId())) {
                throw new RuntimeException("页面 " + page.getPageNumber() + " 不属于当前项目");
            }
        }

        ancientPageMapper.batchAssignPages(pageIds, request.getCollatorId());

        TaskDispatch dispatch = TaskDispatch.builder()
                .projectId(request.getProjectId())
                .pageIds(String.join(",", pageIds.stream().map(String::valueOf).toList()))
                .dispatcherId(dispatcherId)
                .dispatcherName(dispatcherName)
                .collatorId(request.getCollatorId())
                .collatorName(request.getCollatorName())
                .priority(request.getPriority() != null ? request.getPriority() : 1)
                .deadline(request.getDeadline())
                .remark(request.getRemark())
                .status(1)
                .deleted(0)
                .build();
        taskDispatchMapper.insert(dispatch);

        sendTaskNotification(dispatch, project.getName(), pages, "新任务分配");

        return convertToVO(dispatch, project);
    }

    @Transactional(rollbackFor = Exception.class)
    public TaskDispatchVO reassign(Long id, TaskReassignRequest request) {
        TaskDispatch dispatch = taskDispatchMapper.selectById(id);
        if (dispatch == null) {
            throw new RuntimeException("任务分派记录不存在");
        }

        Project project = projectMapper.selectById(dispatch.getProjectId());

        List<Long> oldPageIds = parsePageIds(dispatch.getPageIds());
        List<Long> newPageIds = request.getPageIds() != null ? request.getPageIds() : oldPageIds;

        if (!oldPageIds.equals(newPageIds)) {
            List<Long> pagesToRelease = oldPageIds.stream()
                    .filter(pid -> !newPageIds.contains(pid))
                    .toList();
            if (!pagesToRelease.isEmpty()) {
                releasePages(pagesToRelease);
            }

            List<Long> pagesToAssign = newPageIds.stream()
                    .filter(pid -> !oldPageIds.contains(pid))
                    .toList();
            if (!pagesToAssign.isEmpty()) {
                ancientPageMapper.batchAssignPages(pagesToAssign, request.getCollatorId());
            }
        } else if (!dispatch.getCollatorId().equals(request.getCollatorId())) {
            releasePages(oldPageIds);
            ancientPageMapper.batchAssignPages(newPageIds, request.getCollatorId());
        }

        dispatch.setPageIds(String.join(",", newPageIds.stream().map(String::valueOf).toList()));
        dispatch.setCollatorId(request.getCollatorId());
        dispatch.setCollatorName(request.getCollatorName());
        if (request.getPriority() != null) {
            dispatch.setPriority(request.getPriority());
        }
        if (request.getDeadline() != null) {
            dispatch.setDeadline(request.getDeadline());
        }
        if (request.getRemark() != null) {
            dispatch.setRemark(request.getRemark());
        }
        taskDispatchMapper.updateById(dispatch);

        List<AncientPage> pages = ancientPageMapper.selectBatchIds(newPageIds);
        sendTaskNotification(dispatch, project.getName(), pages, "任务重新分配");

        return convertToVO(dispatch, project);
    }

    @Transactional(rollbackFor = Exception.class)
    public void cancel(Long id, TaskCancelRequest request) {
        TaskDispatch dispatch = taskDispatchMapper.selectById(id);
        if (dispatch == null) {
            throw new RuntimeException("任务分派记录不存在");
        }
        if (dispatch.getStatus() == 2) {
            throw new RuntimeException("任务已取消，请勿重复操作");
        }

        List<Long> pageIds = parsePageIds(dispatch.getPageIds());
        releasePages(pageIds);

        dispatch.setStatus(2);
        taskDispatchMapper.updateById(dispatch);

        Project project = projectMapper.selectById(dispatch.getProjectId());
        List<AncientPage> pages = ancientPageMapper.selectBatchIds(pageIds);
        sendTaskNotification(dispatch, project.getName(), pages, "任务已取消");
    }

    public List<TaskDispatchVO> getProjectDispatches(Long projectId) {
        Project project = projectMapper.selectById(projectId);
        if (project == null) {
            throw new RuntimeException("项目不存在");
        }

        List<TaskDispatch> dispatches = taskDispatchMapper.selectByProjectId(projectId);
        return dispatches.stream()
                .map(d -> convertToVO(d, project))
                .toList();
    }

    public List<TaskDispatchVO> getMyTasks() {
        Long userId = UserContextHolder.getUserId();
        if (userId == null) {
            throw new RuntimeException("用户未登录");
        }

        List<TaskDispatch> dispatches = taskDispatchMapper.selectByCollatorId(userId);
        List<Long> projectIds = dispatches.stream()
                .map(TaskDispatch::getProjectId)
                .distinct()
                .toList();
        Map<Long, Project> projectMap = projectMapper.selectBatchIds(projectIds).stream()
                .collect(Collectors.toMap(Project::getId, p -> p));

        return dispatches.stream()
                .map(d -> convertToVO(d, projectMap.get(d.getProjectId())))
                .toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TaskDispatchVO> autoAssign(Long projectId) {
        Project project = projectMapper.selectById(projectId);
        if (project == null) {
            throw new RuntimeException("项目不存在");
        }

        List<ProjectMember> members = projectMemberMapper.selectMembersByProjectId(projectId);
        List<ProjectMember> collators = members.stream()
                .filter(m -> m.getRole() == 1 || m.getRole() == 2)
                .toList();

        if (collators.isEmpty()) {
            throw new RuntimeException("项目中没有勘校员");
        }

        LambdaQueryWrapper<AncientPage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AncientPage::getProjectId, projectId)
                .in(AncientPage::getStatus, 0, 1)
                .orderByAsc(AncientPage::getPageNumber);
        List<AncientPage> pendingPages = ancientPageMapper.selectList(wrapper);

        if (pendingPages.isEmpty()) {
            return Collections.emptyList();
        }

        Map<Long, Integer> workloadMap = collators.stream()
                .collect(Collectors.toMap(
                        ProjectMember::getUserId,
                        m -> taskDispatchMapper.countActiveTasksByCollatorId(m.getUserId())
                ));

        List<Long> sortedCollatorIds = workloadMap.entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .toList();

        int pagesPerUser = (int) Math.ceil((double) pendingPages.size() / collators.size());

        List<TaskDispatchVO> result = new ArrayList<>();
        Long dispatcherId = UserContextHolder.getUserId();
        String dispatcherName = UserContextHolder.getNickname();

        for (int i = 0; i < collators.size(); i++) {
            Long collatorId = sortedCollatorIds.get(i);
            ProjectMember member = collators.stream()
                    .filter(m -> m.getUserId().equals(collatorId))
                    .findFirst()
                    .orElseThrow();

            int startIdx = i * pagesPerUser;
            int endIdx = Math.min(startIdx + pagesPerUser, pendingPages.size());
            if (startIdx >= endIdx) {
                continue;
            }

            List<AncientPage> userPages = pendingPages.subList(startIdx, endIdx);
            List<Long> pageIds = userPages.stream().map(AncientPage::getId).toList();

            ancientPageMapper.batchAssignPages(pageIds, collatorId);

            TaskDispatch dispatch = TaskDispatch.builder()
                    .projectId(projectId)
                    .pageIds(String.join(",", pageIds.stream().map(String::valueOf).toList()))
                    .dispatcherId(dispatcherId)
                    .dispatcherName(dispatcherName)
                    .collatorId(collatorId)
                    .collatorName(getMemberName(member))
                    .priority(1)
                    .status(1)
                    .deleted(0)
                    .build();
            taskDispatchMapper.insert(dispatch);

            sendTaskNotification(dispatch, project.getName(), userPages, "智能分配新任务");

            result.add(convertToVO(dispatch, project));
        }

        return result;
    }

    public Map<String, Object> getDispatchStatistics(Long projectId) {
        Project project = projectMapper.selectById(projectId);
        if (project == null) {
            throw new RuntimeException("项目不存在");
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("projectId", projectId);
        stats.put("projectName", project.getName());
        stats.put("totalPages", project.getTotalPages());

        int assignedCount = ancientPageMapper.countPagesByStatus(projectId, 1);
        int collatingCount = ancientPageMapper.countPagesByStatus(projectId, 2);
        int reviewingCount = ancientPageMapper.countPagesByStatus(projectId, 3);
        int completedCount = ancientPageMapper.countPagesByStatus(projectId, 4);
        int pendingCount = ancientPageMapper.countPagesByStatus(projectId, 0);

        stats.put("assignedPages", assignedCount);
        stats.put("pendingPages", pendingCount);
        stats.put("inProgressPages", collatingCount);
        stats.put("reviewingPages", reviewingCount);
        stats.put("completedPages", completedCount);

        LambdaQueryWrapper<TaskDispatch> dispatchWrapper = new LambdaQueryWrapper<>();
        dispatchWrapper.eq(TaskDispatch::getProjectId, projectId)
                .eq(TaskDispatch::getStatus, 1);
        Long activeDispatches = taskDispatchMapper.selectCount(dispatchWrapper);
        stats.put("activeDispatches", activeDispatches);

        return stats;
    }

    public TaskDispatchDetailVO getDispatchDetail(Long id) {
        TaskDispatch dispatch = taskDispatchMapper.selectById(id);
        if (dispatch == null) {
            throw new RuntimeException("任务分派记录不存在");
        }

        Project project = projectMapper.selectById(dispatch.getProjectId());
        List<Long> pageIds = parsePageIds(dispatch.getPageIds());
        List<AncientPage> pages = ancientPageMapper.selectBatchIds(pageIds);

        TaskDispatchDetailVO vo = new TaskDispatchDetailVO();
        BeanUtils.copyProperties(dispatch, vo);
        vo.setProjectName(project.getName());
        vo.setPages(pages.stream().map(this::convertToPageVO).toList());
        vo.setPriorityName(getPriorityName(dispatch.getPriority()));
        vo.setStatusName(getStatusName(dispatch.getStatus()));

        long completedCount = pages.stream().filter(p -> p.getStatus() == 4).count();
        vo.setCompletedPages((int) completedCount);
        vo.setProgress(pages.isEmpty() ? 0.0 : Math.round(completedCount * 10000.0 / pages.size()) / 100.0);

        return vo;
    }

    private void releasePages(List<Long> pageIds) {
        for (Long pageId : pageIds) {
            AncientPage page = ancientPageMapper.selectById(pageId);
            if (page != null && (page.getStatus() == 1 || page.getStatus() == 2)) {
                page.setStatus(0);
                page.setCurrentCollatorId(null);
                ancientPageMapper.updateById(page);
            }
        }
    }

    private List<Long> parsePageIds(String pageIdsStr) {
        if (pageIdsStr == null || pageIdsStr.isEmpty()) {
            return Collections.emptyList();
        }
        return Arrays.stream(pageIdsStr.split(","))
                .map(Long::parseLong)
                .toList();
    }

    private TaskDispatchVO convertToVO(TaskDispatch dispatch, Project project) {
        TaskDispatchVO vo = new TaskDispatchVO();
        BeanUtils.copyProperties(dispatch, vo);
        if (project != null) {
            vo.setProjectName(project.getName());
        }
        vo.setPageCount(parsePageIds(dispatch.getPageIds()).size());
        vo.setPriorityName(getPriorityName(dispatch.getPriority()));
        vo.setStatusName(getStatusName(dispatch.getStatus()));

        List<Long> pageIds = parsePageIds(dispatch.getPageIds());
        List<AncientPage> pages = ancientPageMapper.selectBatchIds(pageIds);
        long completedCount = pages.stream().filter(p -> p.getStatus() == 4).count();
        vo.setCompletedPages((int) completedCount);
        vo.setProgress(pages.isEmpty() ? 0.0 : Math.round(completedCount * 10000.0 / pages.size()) / 100.0);

        return vo;
    }

    private AncientPageVO convertToPageVO(AncientPage page) {
        AncientPageVO vo = new AncientPageVO();
        BeanUtils.copyProperties(page, vo);
        vo.setStatusName(getPageStatusName(page.getStatus()));
        return vo;
    }

    private String getPriorityName(Integer priority) {
        return switch (priority) {
            case 0 -> "低";
            case 1 -> "中";
            case 2 -> "高";
            case 3 -> "紧急";
            default -> "未知";
        };
    }

    private String getStatusName(Integer status) {
        return switch (status) {
            case 0 -> "待分派";
            case 1 -> "进行中";
            case 2 -> "已取消";
            case 3 -> "已完成";
            default -> "未知";
        };
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

    private String getMemberName(ProjectMember member) {
        return "用户" + member.getUserId();
    }

    private void sendTaskNotification(TaskDispatch dispatch, String projectName,
                                       List<AncientPage> pages, String title) {
        String dispatcherName = dispatch.getDispatcherName();
        StringBuilder content = new StringBuilder();
        content.append(dispatcherName != null ? dispatcherName : "系统")
                .append(" 为您分配了 ").append(pages.size()).append(" 页勘校任务: ");
        if (pages.size() <= 3) {
            content.append(pages.stream()
                    .map(p -> "第" + p.getPageNumber() + "页")
                    .collect(Collectors.joining(", ")));
        } else {
            content.append(pages.subList(0, 3).stream()
                    .map(p -> "第" + p.getPageNumber() + "页")
                    .collect(Collectors.joining(", ")));
            content.append(" 等");
        }

        NotificationMessage message = NotificationMessage.builder()
                .id(UUID.randomUUID().toString())
                .type(7)
                .typeName("任务通知")
                .projectId(dispatch.getProjectId())
                .businessId(String.valueOf(dispatch.getId()))
                .title(title)
                .content(content.toString())
                .senderId(dispatch.getDispatcherId())
                .senderName(dispatch.getDispatcherName())
                .receiverIds(new Long[]{dispatch.getCollatorId()})
                .sendTime(LocalDateTime.now())
                .build();

        notificationService.sendToProject(dispatch.getProjectId(), message);
        notificationService.sendToUsers(new Long[]{dispatch.getCollatorId()}, message);
    }
}
