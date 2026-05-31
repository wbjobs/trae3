package com.ancient.platform.project.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskDispatchDetailVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;

    private Long projectId;

    private String projectName;

    private List<AncientPageVO> pages;

    private Long dispatcherId;

    private String dispatcherName;

    private Long collatorId;

    private String collatorName;

    private Integer priority;

    private String priorityName;

    private LocalDateTime deadline;

    private String remark;

    private Integer status;

    private String statusName;

    private Integer completedPages;

    private Double progress;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
