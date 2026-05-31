package com.research.sample.auth.service;

import com.research.sample.auth.config.JwtConfig;
import com.research.sample.auth.entity.Role;
import com.research.sample.auth.entity.User;
import com.research.sample.auth.entity.UserRole;
import com.research.sample.auth.repository.RoleRepository;
import com.research.sample.auth.repository.UserRepository;
import com.research.sample.auth.repository.UserRoleRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;
    private final JwtConfig jwtConfig;
    private final BCryptPasswordEncoder passwordEncoder;

    public AuthService(UserRepository userRepository, RoleRepository roleRepository,
                       UserRoleRepository userRoleRepository, JwtConfig jwtConfig) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.userRoleRepository = userRoleRepository;
        this.jwtConfig = jwtConfig;
        this.passwordEncoder = new BCryptPasswordEncoder();
    }

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(jwtConfig.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public Map<String, Object> login(String username, String password) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("用户名或密码错误"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new RuntimeException("用户名或密码错误");
        }

        if (!"ACTIVE".equals(user.getStatus())) {
            throw new RuntimeException("账号已被禁用");
        }

        List<String> roles = getUserRoles(user.getId()).stream()
                .map(Role::getRoleCode)
                .toList();

        String token = Jwts.builder()
                .subject(user.getId().toString())
                .claim("username", user.getUsername())
                .claim("tenantId", user.getTenantId())
                .claim("roles", String.join(",", roles))
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + jwtConfig.getExpiration()))
                .signWith(getSigningKey())
                .compact();

        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("userId", user.getId());
        result.put("username", user.getUsername());
        result.put("realName", user.getRealName());
        result.put("tenantId", user.getTenantId());
        result.put("roles", roles);
        return result;
    }

    public Map<String, Object> register(String username, String password, String realName, Long tenantId, String department) {
        if (userRepository.findByUsername(username).isPresent()) {
            throw new RuntimeException("用户名已存在");
        }

        User user = new User();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setRealName(realName);
        user.setTenantId(tenantId);
        user.setDepartment(department);
        user.setStatus("ACTIVE");

        User savedUser = userRepository.save(user);

        Map<String, Object> result = new HashMap<>();
        result.put("userId", savedUser.getId());
        result.put("username", savedUser.getUsername());
        result.put("message", "注册成功");
        return result;
    }

    public Claims validateToken(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public List<Role> getUserRoles(Long userId) {
        List<UserRole> userRoles = userRoleRepository.findByUserId(userId);
        List<Long> roleIds = userRoles.stream().map(UserRole::getRoleId).toList();
        return roleRepository.findAllById(roleIds);
    }
}
