package com.specimen.auth.service;

import com.specimen.auth.dto.LoginDTO;
import com.specimen.auth.dto.RegisterDTO;
import com.specimen.auth.entity.SysUser;
import com.specimen.auth.vo.TokenVO;

public interface AuthService {

    TokenVO login(LoginDTO loginDTO);

    void register(RegisterDTO registerDTO);

    void logout();

    SysUser getUserInfo();
}
