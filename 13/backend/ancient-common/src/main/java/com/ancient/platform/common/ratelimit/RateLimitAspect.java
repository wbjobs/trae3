package com.ancient.platform.common.ratelimit;

import cn.hutool.core.util.StrUtil;
import com.ancient.platform.common.ratelimit.annotation.RateLimit;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RateIntervalUnit;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;
import java.util.concurrent.TimeUnit;

@Slf4j
@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 2)
@RequiredArgsConstructor
public class RateLimitAspect {

    private final RedissonClient redissonClient;

    @Value("${rate-limit.default:100}")
    private int defaultLimit;

    private final ExpressionParser parser = new SpelExpressionParser();

    private final DefaultParameterNameDiscoverer parameterNameDiscoverer = new DefaultParameterNameDiscoverer();

    @Around("@annotation(rateLimit)")
    public Object around(ProceedingJoinPoint joinPoint, RateLimit rateLimit) throws Throwable {
        String keyExpression = rateLimit.key();
        int limit = rateLimit.limit() > 0 ? rateLimit.limit() : defaultLimit;
        int window = rateLimit.window() > 0 ? rateLimit.window() : 1;
        TimeUnit timeUnit = rateLimit.timeUnit();

        String rateLimitKey = buildRateLimitKey(keyExpression, joinPoint);

        RRateLimiter rateLimiter = redissonClient.getRateLimiter(rateLimitKey);
        rateLimiter.trySetRate(RateType.OVERALL, limit, window, convertToRateIntervalUnit(timeUnit));

        boolean allowed = rateLimiter.tryAcquire();
        if (!allowed) {
            log.warn("请求被限流: key={}, limit={}/{}", rateLimitKey, limit, timeUnit);
            throw new RateLimitException(rateLimitKey, limit, window);
        }

        log.debug("请求通过限流: key={}", rateLimitKey);
        return joinPoint.proceed();
    }

    private String buildRateLimitKey(String keyExpression, ProceedingJoinPoint joinPoint) {
        StringBuilder keyBuilder = new StringBuilder("rate_limit:");

        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        String className = signature.getDeclaringTypeName();
        String methodName = signature.getName();
        keyBuilder.append(className).append(":").append(methodName);

        if (StrUtil.isNotBlank(keyExpression)) {
            Object[] args = joinPoint.getArgs();
            Method method = signature.getMethod();
            String[] paramNames = parameterNameDiscoverer.getParameterNames(method);

            if (paramNames != null && paramNames.length > 0) {
                EvaluationContext context = new StandardEvaluationContext();
                for (int i = 0; i < paramNames.length; i++) {
                    context.setVariable(paramNames[i], args[i]);
                }

                try {
                    Expression expression = parser.parseExpression(keyExpression);
                    Object value = expression.getValue(context);
                    if (value != null) {
                        keyBuilder.append(":").append(value);
                    }
                } catch (Exception e) {
                    log.warn("解析限流key表达式失败: {}", keyExpression, e);
                }
            }
        } else {
            String clientIp = getClientIp();
            if (StrUtil.isNotBlank(clientIp)) {
                keyBuilder.append(":").append(clientIp);
            }
        }

        return keyBuilder.toString();
    }

    private String getClientIp() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                String ip = request.getHeader("X-Forwarded-For");
                if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
                    ip = request.getHeader("Proxy-Client-IP");
                }
                if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
                    ip = request.getHeader("WL-Proxy-Client-IP");
                }
                if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
                    ip = request.getRemoteAddr();
                }
                if (ip != null && ip.contains(",")) {
                    ip = ip.split(",")[0].trim();
                }
                return ip;
            }
        } catch (Exception e) {
            log.warn("获取客户端IP失败", e);
        }
        return null;
    }

    private RateIntervalUnit convertToRateIntervalUnit(TimeUnit timeUnit) {
        return switch (timeUnit) {
            case SECONDS -> RateIntervalUnit.SECONDS;
            case MINUTES -> RateIntervalUnit.MINUTES;
            case HOURS -> RateIntervalUnit.HOURS;
            case DAYS -> RateIntervalUnit.DAYS;
            default -> RateIntervalUnit.MINUTES;
        };
    }
}
