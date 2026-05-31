package com.railway.common.dto;

import java.io.Serializable;

public class LoginResponseDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String token;

    private Long expiresIn;

    private String tokenType;

    public LoginResponseDTO() {
    }

    public LoginResponseDTO(String token, Long expiresIn) {
        this.token = token;
        this.expiresIn = expiresIn;
        this.tokenType = "Bearer";
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public Long getExpiresIn() {
        return expiresIn;
    }

    public void setExpiresIn(Long expiresIn) {
        this.expiresIn = expiresIn;
    }

    public String getTokenType() {
        return tokenType;
    }

    public void setTokenType(String tokenType) {
        this.tokenType = tokenType;
    }
}
