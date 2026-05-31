package com.ancient.platform.project.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

@Data
public class TaskCancelRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    @Size(max = 500, message = "取消原因长度不能超过500个字符")
    private String reason;
}
