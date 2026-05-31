package com.ancient.platform.project.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.ancient.platform.project.dto.request.ProjectCreateRequest;
import com.ancient.platform.project.dto.response.ProjectVO;
import com.ancient.platform.project.entity.Project;
import com.ancient.platform.project.entity.ProjectMember;
import com.ancient.platform.project.mapper.AncientPageMapper;
import com.ancient.platform.project.mapper.ProjectMapper;
import com.ancient.platform.project.mapper.ProjectMemberMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectMapper projectMapper;
    private final ProjectMemberMapper projectMemberMapper;
    private final AncientPageMapper ancientPageMapper;

    @Transactional(rollbackFor = Exception.class)
    public ProjectVO createProject(ProjectCreateRequest request) {
        Project project = new Project();
        BeanUtils.copyProperties(request, project);
        project.setStatus(0);
        project.setCompletedPages(0);
        project.setDeleted(0);
        projectMapper.insert(project);

        ProjectMember member = new ProjectMember();
        member.setProjectId(project.getId());
        member.setUserId(request.getCreatorId());
        member.setRole(0);
        member.setStatus(0);
        member.setCompletedPages(0);
        member.setTotalCollatedChars(0L);
        member.setDeleted(0);
        projectMemberMapper.insert(member);

        return convertToVO(project);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProjectVO updateProject(Long id, ProjectCreateRequest request) {
        Project project = projectMapper.selectById(id);
        if (project == null) {
            throw new RuntimeException("项目不存在");
        }
        project.setName(request.getName());
        project.setDescription(request.getDescription());
        project.setCoverImage(request.getCoverImage());
        project.setTotalPages(request.getTotalPages());
        projectMapper.updateById(project);
        return convertToVO(project);
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteProject(Long id) {
        Project project = projectMapper.selectById(id);
        if (project == null) {
            throw new RuntimeException("项目不存在");
        }
        project.setDeleted(1);
        projectMapper.updateById(project);
    }

    public ProjectVO getProjectById(Long id) {
        Project project = projectMapper.selectById(id);
        if (project == null) {
            throw new RuntimeException("项目不存在");
        }
        return convertToVO(project);
    }

    public Page<ProjectVO> listProjects(Integer pageNum, Integer pageSize, Long userId, Integer status) {
        Page<Project> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<Project> wrapper = new LambdaQueryWrapper<>();
        if (status != null) {
            wrapper.eq(Project::getStatus, status);
        }
        if (userId != null) {
            List<Project> userProjects = projectMapper.selectProjectsByUserId(userId);
            if (userProjects.isEmpty()) {
                return new Page<>(pageNum, pageSize, 0);
            }
            List<Long> projectIds = userProjects.stream().map(Project::getId).toList();
            wrapper.in(Project::getId, projectIds);
        }
        wrapper.orderByDesc(Project::getUpdateTime);
        Page<Project> projectPage = projectMapper.selectPage(page, wrapper);

        Page<ProjectVO> voPage = new Page<>(projectPage.getCurrent(), projectPage.getSize(), projectPage.getTotal());
        voPage.setRecords(projectPage.getRecords().stream().map(this::convertToVO).toList());
        return voPage;
    }

    @Transactional(rollbackFor = Exception.class)
    public void addMember(Long projectId, Long userId, Integer role) {
        ProjectMember existing = projectMemberMapper.selectByProjectIdAndUserId(projectId, userId);
        if (existing != null) {
            throw new RuntimeException("用户已是项目成员");
        }
        ProjectMember member = new ProjectMember();
        member.setProjectId(projectId);
        member.setUserId(userId);
        member.setRole(role);
        member.setStatus(0);
        member.setCompletedPages(0);
        member.setTotalCollatedChars(0L);
        member.setDeleted(0);
        projectMemberMapper.insert(member);
    }

    @Transactional(rollbackFor = Exception.class)
    public void removeMember(Long projectId, Long userId) {
        Integer rows = projectMemberMapper.removeMember(projectId, userId);
        if (rows == 0) {
            throw new RuntimeException("成员不存在或已移除");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateMemberRole(Long projectId, Long userId, Integer role) {
        Integer rows = projectMemberMapper.updateMemberRole(projectId, userId, role);
        if (rows == 0) {
            throw new RuntimeException("成员不存在");
        }
    }

    public Map<String, Object> getProjectProgress(Long projectId) {
        Project project = projectMapper.selectById(projectId);
        if (project == null) {
            throw new RuntimeException("项目不存在");
        }
        Map<String, Object> progress = new HashMap<>();
        progress.put("projectId", project.getId());
        progress.put("totalPages", project.getTotalPages());
        progress.put("completedPages", project.getCompletedPages());
        progress.put("progress", project.getTotalPages() > 0
                ? Math.round(project.getCompletedPages() * 10000.0 / project.getTotalPages()) / 100.0
                : 0.0);

        int pendingCount = ancientPageMapper.countPagesByStatus(projectId, 0);
        int collatingCount = ancientPageMapper.countPagesByStatus(projectId, 2);
        int reviewingCount = ancientPageMapper.countPagesByStatus(projectId, 3);
        int completedCount = ancientPageMapper.countPagesByStatus(projectId, 4);
        progress.put("pendingPages", pendingCount);
        progress.put("collatingPages", collatingCount);
        progress.put("reviewingPages", reviewingCount);
        progress.put("completedPagesByStatus", completedCount);
        return progress;
    }

    private ProjectVO convertToVO(Project project) {
        ProjectVO vo = new ProjectVO();
        BeanUtils.copyProperties(project, vo);
        vo.setStatusName(getProjectStatusName(project.getStatus()));
        vo.setProgress(project.getTotalPages() > 0
                ? Math.round(project.getCompletedPages() * 10000.0 / project.getTotalPages()) / 100.0
                : 0.0);
        Integer memberCount = projectMemberMapper.countMembers(project.getId());
        vo.setMemberCount(memberCount);
        return vo;
    }

    private String getProjectStatusName(Integer status) {
        return switch (status) {
            case 0 -> "待开始";
            case 1 -> "进行中";
            case 2 -> "已完成";
            case 3 -> "已暂停";
            default -> "未知";
        };
    }
}
