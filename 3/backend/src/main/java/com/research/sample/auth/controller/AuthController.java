package com.research.sample.auth.controller;

import com.research.sample.auth.context.TenantContext;
import com.research.sample.auth.entity.Role;
import com.research.sample.auth.entity.User;
import com.research.sample.auth.repository.UserRepository;
import com.research.sample.auth.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final UserRepository userRepository;

    public AuthController(AuthService authService, UserRepository userRepository) {
        this.authService = authService;
        this.userRepository = userRepository;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> request) {
        Map<String, Object> result = authService.login(
                request.get("username"),
                request.get("password")
        );
        return ResponseEntity.ok(result);
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, String> request) {
        Map<String, Object> result = authService.register(
                request.get("username"),
                request.get("password"),
                request.get("realName"),
                request.get("tenantId") != null ? Long.parseLong(request.get("tenantId")) : null,
                request.get("department")
        );
        return ResponseEntity.ok(result);
    }

    @GetMapping("/info")
    public ResponseEntity<Map<String, Object>> info() {
        Long userId = TenantContext.getUserId();
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("message", "未登录"));
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("用户不存在"));

        List<Role> roles = authService.getUserRoles(userId);

        return ResponseEntity.ok(Map.of(
                "userId", user.getId(),
                "username", user.getUsername(),
                "realName", user.getRealName(),
                "email", user.getEmail() != null ? user.getEmail() : "",
                "phone", user.getPhone() != null ? user.getPhone() : "",
                "tenantId", user.getTenantId() != null ? user.getTenantId() : 0,
                "department", user.getDepartment() != null ? user.getDepartment() : "",
                "roles", roles.stream().map(Role::getRoleCode).toList()
        ));
    }
}
