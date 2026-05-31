package com.ancient.platform.project.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskDispatchVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;

    private Long projectId;

    private String projectName;

    private Integer pageCount;

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
