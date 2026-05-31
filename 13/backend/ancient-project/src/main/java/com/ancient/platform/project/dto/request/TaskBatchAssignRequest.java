package com.ancient.platform.project.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class TaskBatchAssignRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotNull(message = "项目ID不能为空")
    private Long projectId;

    @NotEmpty(message = "页面ID列表不能为空")
    @Size(min = 1, message = "至少选择一个页面")
    private List<Long> pageIds;

    @NotNull(message = "勘校员ID不能为空")
    private Long collatorId;

    @NotNull(message = "勘校员姓名不能为空")
    private String collatorName;

    private Integer priority;

    private LocalDateTime deadline;

    @Size(max = 500, message = "备注长度不能超过500个字符")
    private String remark;
}
