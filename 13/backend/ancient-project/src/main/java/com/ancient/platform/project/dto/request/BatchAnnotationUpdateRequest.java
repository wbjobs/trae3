package com.ancient.platform.project.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class BatchAnnotationUpdateRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotEmpty(message = "批注ID列表不能为空")
    private List<String> annotationIds;

    @NotNull(message = "状态不能为空")
    private Integer status;

    private String content;

    private Long operatorId;
}
