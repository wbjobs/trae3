package com.specimen.gateway.filter;

import com.alibaba.fastjson2.JSON;
import com.specimen.common.constants.SecurityConstants;
import com.specimen.common.enums.ResultCode;
import com.specimen.common.result.Result;
import com.specimen.common.utils.JwtUtil;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

@Component
@RequiredArgsConstructor
public class AuthFilter implements GlobalFilter, Ordered {

    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        if (isWhiteList(path)) {
            return chain.filter(exchange);
        }

        String token = request.getHeaders().getFirst(SecurityConstants.TOKEN_HEADER);
        if (token != null && token.startsWith(SecurityConstants.TOKEN_PREFIX)) {
            token = token.substring(SecurityConstants.TOKEN_PREFIX.length());
        }

        if (token == null || token.isEmpty()) {
            return writeUnauthorizedResponse(exchange, ResultCode.TOKEN_INVALID.getMessage());
        }

        try {
            Claims claims = JwtUtil.parseToken(token);
            Long tenantId = claims.get("tenantId", Long.class);
            Long userId = claims.get("userId", Long.class);
            String username = claims.getSubject();

            ServerHttpRequest mutatedRequest = request.mutate()
                    .header(SecurityConstants.TENANT_HEADER, tenantId != null ? tenantId.toString() : "")
                    .header(SecurityConstants.USER_ID_HEADER, userId != null ? userId.toString() : "")
                    .header(SecurityConstants.USERNAME_HEADER, username != null ? username : "")
                    .build();

            return chain.filter(exchange.mutate().request(mutatedRequest).build());
        } catch (RuntimeException e) {
            return writeUnauthorizedResponse(exchange, e.getMessage());
        }
    }

    private boolean isWhiteList(String path) {
        for (String pattern : SecurityConstants.WHITE_LIST) {
            if (PATH_MATCHER.match(pattern, path)) {
                return true;
            }
        }
        return false;
    }

    private Mono<Void> writeUnauthorizedResponse(ServerWebExchange exchange, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        Result<Void> result = Result.fail(ResultCode.UNAUTHORIZED, message);
        String json = JSON.toJSONString(result);
        DataBuffer buffer = response.bufferFactory().wrap(json.getBytes(StandardCharsets.UTF_8));

        return response.writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
