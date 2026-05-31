package com.ancient.platform.auth.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 管理员更新用户请求
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class UserUpdateRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    private String nickname;

    private String avatar;

    private String email;

    private String phone;

    private Integer gender;

    private Integer status;
}
