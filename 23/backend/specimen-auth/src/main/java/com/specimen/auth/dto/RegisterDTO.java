package com.specimen.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class RegisterDTO {

    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    private String password;

    @NotBlank(message = "昵称不能为空")
    private String nickname;

    @Email(message = "邮箱格式不正确")
    private String email;

    @NotBlank(message = "租户名称不能为空")
    private String tenantName;

    @NotBlank(message = "租户编码不能为空")
    private String tenantCode;
}
