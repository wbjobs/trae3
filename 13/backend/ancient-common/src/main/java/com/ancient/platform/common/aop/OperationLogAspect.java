package com.ancient.platform.common.aop;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.ancient.platform.common.context.UserContextHolder;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.io.Serializable;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 操作日志切面
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Slf4j
@Aspect
@Component
@Order(1)
@RequiredArgsConstructor
public class OperationLogAspect {

    @Around("@annotation(operationLog)")
    public Object around(ProceedingJoinPoint joinPoint, OperationLog operationLog) throws Throwable {
        long startTime = System.currentTimeMillis();
        LocalDateTime operateTime = LocalDateTime.now();
        Object result = null;
        Exception exception = null;

        try {
            result = joinPoint.proceed();
            return result;
        } catch (Exception e) {
            exception = e;
            throw e;
        } finally {
            long costTime = System.currentTimeMillis() - startTime;
            saveOperationLog(joinPoint, operationLog, operateTime, costTime, result, exception);
        }
    }

    @Async
    protected void saveOperationLog(ProceedingJoinPoint joinPoint, OperationLog operationLog,
                                    LocalDateTime operateTime, long costTime, Object result, Exception exception) {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            HttpServletRequest request = attributes != null ? attributes.getRequest() : null;

            LogInfo logInfo = new LogInfo();
            logInfo.setModule(operationLog.module());
            logInfo.setDescription(StrUtil.isNotBlank(operationLog.description()) ? operationLog.description() : operationLog.value());
            logInfo.setType(operationLog.type().name());
            logInfo.setOperateTime(operateTime);
            logInfo.setCostTime(costTime);
            logInfo.setSuccess(exception == null);

            if (request != null) {
                logInfo.setRequestIp(getIpAddress(request));
                logInfo.setRequestUrl(request.getRequestURI());
                logInfo.setRequestMethod(request.getMethod());
                logInfo.setUserAgent(request.getHeader("User-Agent"));
            }

            UserContextHolder.UserContext userContext = UserContextHolder.getContext();
            if (userContext != null) {
                logInfo.setUserId(userContext.getUserId());
                logInfo.setUsername(userContext.getUsername());
            }

            MethodSignature signature = (MethodSignature) joinPoint.getSignature();
            Method method = signature.getMethod();
            logInfo.setMethodName(method.getDeclaringClass().getName() + "." + method.getName());

            try {
                Object[] args = joinPoint.getArgs();
                Map<String, Object> params = new HashMap<>();
                String[] paramNames = signature.getParameterNames();
                if (paramNames != null && paramNames.length > 0) {
                    for (int i = 0; i < paramNames.length; i++) {
                        if (isIgnoreParam(args[i])) {
                            continue;
                        }
                        params.put(paramNames[i], args[i]);
                    }
                }
                logInfo.setRequestParams(JSONUtil.toJsonStr(params));
            } catch (Exception e) {
                log.warn("记录请求参数失败: {}", e.getMessage());
            }

            if (exception != null) {
                logInfo.setErrorMsg(exception.getMessage());
            }

            log.info("操作日志: {}", JSONUtil.toJsonStr(logInfo));

        } catch (Exception e) {
            log.error("记录操作日志失败: {}", e.getMessage());
        }
    }

    private boolean isIgnoreParam(Object param) {
        if (param == null) {
            return true;
        }
        String className = param.getClass().getName();
        return className.contains("HttpServletRequest")
                || className.contains("HttpServletResponse")
                || className.contains("MultipartFile");
    }

    private String getIpAddress(HttpServletRequest request) {
        String ip = request.getHeader("x-forwarded-for");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_CLIENT_IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_X_FORWARDED_FOR");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return "0:0:0:0:0:0:0:1".equals(ip) ? "127.0.0.1" : ip;
    }

    @lombok.Data
    public static class LogInfo implements Serializable {
        private static final long serialVersionUID = 1L;
        private String module;
        private String description;
        private String type;
        private LocalDateTime operateTime;
        private Long costTime;
        private Boolean success;
        private String requestIp;
        private String requestUrl;
        private String requestMethod;
        private String userAgent;
        private Long userId;
        private String username;
        private String methodName;
        private String requestParams;
        private String errorMsg;
    }
}
