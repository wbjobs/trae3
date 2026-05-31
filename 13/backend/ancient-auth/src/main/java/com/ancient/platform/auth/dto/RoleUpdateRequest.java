package com.ancient.platform.auth.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 更新角色请求
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class RoleUpdateRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    private String name;

    private String code;

    private String description;

    private Integer sort;

    private Integer status;
}
