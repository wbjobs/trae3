package com.ancient.platform.project.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class BatchPageStatusRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotEmpty(message = "页面ID列表不能为空")
    private List<Long> pageIds;

    @NotNull(message = "状态不能为空")
    private Integer status;

    private Long operatorId;
}
