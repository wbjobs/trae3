package com.specimen.auth.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TokenVO {

    private String accessToken;

    private String tokenType;

    private Long expiresIn;

    private Long userId;

    private String username;

    private Long tenantId;

    private String tenantName;
}
