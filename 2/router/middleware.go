package router

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/juju/ratelimit"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/config"
	"industrial-protocol-gateway/logger"
)

type contextKey string

const (
	UserContextKey    contextKey = "user"
	TraceIDContextKey contextKey = "trace_id"
)

type UserInfo struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	APIKey   string `json:"api_key,omitempty"`
}

type RateLimiter struct {
	globalBucket *ratelimit.Bucket
	ipBuckets    map[string]*ratelimit.Bucket
	keyBuckets   map[string]*ratelimit.Bucket
	ipLastAccess map[string]time.Time
	keyLastAccess map[string]time.Time
	pathBuckets  map[string]*ratelimit.Bucket
	mu           sync.RWMutex
	whitelistIP  map[string]bool
	whitelistKey map[string]bool
}

var (
	rateLimiter *RateLimiter
	limiterOnce sync.Once
)

func InitRateLimiter() {
	limiterOnce.Do(func() {
		cfg := config.Get().RateLimit
		rateLimiter = &RateLimiter{
			globalBucket:  ratelimit.NewBucket(time.Second, cfg.Global),
			ipBuckets:     make(map[string]*ratelimit.Bucket),
			keyBuckets:    make(map[string]*ratelimit.Bucket),
			ipLastAccess:  make(map[string]time.Time),
			keyLastAccess: make(map[string]time.Time),
			pathBuckets:   make(map[string]*ratelimit.Bucket),
			whitelistIP:   make(map[string]bool),
			whitelistKey:  make(map[string]bool),
		}

		for _, ip := range cfg.WhitelistIP {
			rateLimiter.whitelistIP[ip] = true
		}
		for _, key := range cfg.WhitelistKey {
			rateLimiter.whitelistKey[key] = true
		}
		for path, limit := range cfg.PathLimits {
			rateLimiter.pathBuckets[path] = ratelimit.NewBucket(time.Second, limit)
		}

		go rateLimiter.cleanupExpiredBuckets()
		logger.Info("rate limiter initialized")
	})
}

func (rl *RateLimiter) isIPWhitelisted(ip string) bool {
	rl.mu.RLock()
	defer rl.mu.RUnlock()
	return rl.whitelistIP[ip]
}

func (rl *RateLimiter) isKeyWhitelisted(key string) bool {
	rl.mu.RLock()
	defer rl.mu.RUnlock()
	return rl.whitelistKey[key]
}

func (rl *RateLimiter) cleanupExpiredBuckets() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.cleanup()
		}
	}
}

func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	cutoff := time.Now().Add(-30 * time.Minute)
	cleanedCount := 0

	for ip, lastAccess := range rl.ipLastAccess {
		if lastAccess.Before(cutoff) {
			delete(rl.ipBuckets, ip)
			delete(rl.ipLastAccess, ip)
			cleanedCount++
		}
	}

	for key, lastAccess := range rl.keyLastAccess {
		if lastAccess.Before(cutoff) {
			delete(rl.keyBuckets, key)
			delete(rl.keyLastAccess, key)
			cleanedCount++
		}
	}

	if cleanedCount > 0 {
		logger.Infof("cleaned up %d expired rate limit buckets", cleanedCount)
	}
}

func getIPBucket(ip string) *ratelimit.Bucket {
	rateLimiter.mu.RLock()
	bucket, exists := rateLimiter.ipBuckets[ip]
	rateLimiter.mu.RUnlock()

	if !exists {
		rateLimiter.mu.Lock()
		bucket, exists = rateLimiter.ipBuckets[ip]
		if !exists {
			bucket = ratelimit.NewBucket(time.Second, config.Get().RateLimit.PerIP)
			rateLimiter.ipBuckets[ip] = bucket
		}
		rateLimiter.ipLastAccess[ip] = time.Now()
		rateLimiter.mu.Unlock()
	} else {
		rateLimiter.mu.Lock()
		rateLimiter.ipLastAccess[ip] = time.Now()
		rateLimiter.mu.Unlock()
	}
	return bucket
}

func getKeyBucket(key string) *ratelimit.Bucket {
	rateLimiter.mu.RLock()
	bucket, exists := rateLimiter.keyBuckets[key]
	rateLimiter.mu.RUnlock()

	if !exists {
		rateLimiter.mu.Lock()
		bucket, exists = rateLimiter.keyBuckets[key]
		if !exists {
			bucket = ratelimit.NewBucket(time.Second, config.Get().RateLimit.PerKey)
			rateLimiter.keyBuckets[key] = bucket
		}
		rateLimiter.keyLastAccess[key] = time.Now()
		rateLimiter.mu.Unlock()
	} else {
		rateLimiter.mu.Lock()
		rateLimiter.keyLastAccess[key] = time.Now()
		rateLimiter.mu.Unlock()
	}
	return bucket
}

func getPathBucket(path string) *ratelimit.Bucket {
	rateLimiter.mu.RLock()
	bucket, _ := rateLimiter.pathBuckets[path]
	rateLimiter.mu.RUnlock()
	return bucket
}

func getClientIP(c *gin.Context) string {
	xForwardedFor := c.GetHeader("X-Forwarded-For")
	if xForwardedFor != "" {
		ips := strings.Split(xForwardedFor, ",")
		if len(ips) > 0 {
			ip := strings.TrimSpace(ips[0])
			if net.ParseIP(ip) != nil {
				return ip
			}
		}
	}

	xRealIP := c.GetHeader("X-Real-IP")
	if xRealIP != "" && net.ParseIP(xRealIP) != nil {
		return xRealIP
	}

	ip, _, err := net.SplitHostPort(c.Request.RemoteAddr)
	if err != nil {
		return c.Request.RemoteAddr
	}
	return ip
}

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Trace-ID")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "X-Trace-ID")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		traceID := c.GetHeader("X-Trace-ID")
		if traceID == "" {
			traceID = fmt.Sprintf("%d", common.GenerateID())
		}

		c.Set("trace_id", traceID)
		c.Writer.Header().Set("X-Trace-ID", traceID)

		ctx := context.WithValue(c.Request.Context(), logger.TraceIDKey, traceID)
		c.Request = c.Request.WithContext(ctx)

		c.Next()
	}
}

func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		method := c.Request.Method

		c.Next()

		latency := time.Since(start)
		statusCode := c.Writer.Status()
		clientIP := getClientIP(c)
		traceID := c.GetString("trace_id")

		ctx := logger.NewContextWithTraceID(c.Request.Context(), traceID)
		logger.LogAPI(ctx, method, path, statusCode, latency, clientIP)
	}
}

func RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if rateLimiter == nil {
			InitRateLimiter()
		}

		traceID := c.GetString("trace_id")
		ip := getClientIP(c)
		apiKey := c.GetHeader("X-API-Key")
		path := c.Request.URL.Path

		if rateLimiter.isIPWhitelisted(ip) {
			setRateLimitHeaders(c, -1, -1, -1)
			c.Next()
			return
		}
		if apiKey != "" && rateLimiter.isKeyWhitelisted(apiKey) {
			setRateLimitHeaders(c, -1, -1, -1)
			c.Next()
			return
		}

		globalRemaining := rateLimiter.globalBucket.TakeAvailable(1)
		if globalRemaining < 1 {
			logger.Warnf("global rate limit exceeded, ip: %s, path: %s, trace_id: %s",
				ip, path, traceID)
			logger.LogAudit(&logger.AuditLog{
				Action:   "rate_limit_exceeded",
				Resource: "global",
				IP:       ip,
				Details:  map[string]interface{}{"path": path, "trace_id": traceID},
			})
			c.Writer.Header().Set("Retry-After", "1")
			c.Writer.Header().Set("X-RateLimit-Limit",
				fmt.Sprintf("%d", config.Get().RateLimit.Global))
			c.Writer.Header().Set("X-RateLimit-Remaining", "0")
			c.Writer.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Second).Unix()))
			c.JSON(http.StatusTooManyRequests, common.ErrorResponse(common.ErrRateLimitExceeded, traceID, 0))
			c.Abort()
			return
		}

		ipRemaining := getIPBucket(ip).TakeAvailable(1)
		if ipRemaining < 1 {
			logger.Warnf("IP rate limit exceeded, ip: %s, path: %s, trace_id: %s",
				ip, path, traceID)
			logger.LogAudit(&logger.AuditLog{
				Action:   "rate_limit_exceeded",
				Resource: "ip",
				IP:       ip,
				Details:  map[string]interface{}{"path": path, "trace_id": traceID},
			})
			c.Writer.Header().Set("Retry-After", "1")
			c.Writer.Header().Set("X-RateLimit-Limit",
				fmt.Sprintf("%d", config.Get().RateLimit.PerIP))
			c.Writer.Header().Set("X-RateLimit-Remaining", "0")
			c.Writer.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Second).Unix()))
			c.JSON(http.StatusTooManyRequests, common.ErrorResponse(common.ErrRateLimitExceeded, traceID, 0))
			c.Abort()
			return
		}

		var keyRemaining int64 = -1
		if apiKey != "" {
			keyRemaining = getKeyBucket(apiKey).TakeAvailable(1)
			if keyRemaining < 1 {
				logger.Warnf("API Key rate limit exceeded, key: %s, ip: %s, path: %s, trace_id: %s",
					apiKey[:8]+"...", ip, path, traceID)
				logger.LogAudit(&logger.AuditLog{
					Action:   "rate_limit_exceeded",
					Resource: "api_key",
					IP:       ip,
					Details:  map[string]interface{}{"path": path, "trace_id": traceID},
				})
				c.Writer.Header().Set("Retry-After", "1")
				c.Writer.Header().Set("X-RateLimit-Limit",
					fmt.Sprintf("%d", config.Get().RateLimit.PerKey))
				c.Writer.Header().Set("X-RateLimit-Remaining", "0")
				c.Writer.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Second).Unix()))
				c.JSON(http.StatusTooManyRequests, common.ErrorResponse(common.ErrRateLimitExceeded, traceID, 0))
				c.Abort()
				return
			}
		}

		if pathBucket := getPathBucket(path); pathBucket != nil {
			pathRemaining := pathBucket.TakeAvailable(1)
			if pathRemaining < 1 {
				logger.Warnf("Path rate limit exceeded, path: %s, ip: %s, trace_id: %s",
					path, ip, traceID)
				logger.LogAudit(&logger.AuditLog{
					Action:   "rate_limit_exceeded",
					Resource: "path",
					IP:       ip,
					Details:  map[string]interface{}{"path": path, "trace_id": traceID},
				})
				c.Writer.Header().Set("Retry-After", "1")
				c.JSON(http.StatusTooManyRequests, common.ErrorResponse(common.ErrRateLimitExceeded, traceID, 0))
				c.Abort()
				return
			}
		}

		setRateLimitHeaders(c, globalRemaining, ipRemaining, keyRemaining)
		c.Next()
	}
}

func setRateLimitHeaders(c *gin.Context, global, ip, key int64) {
	if global >= 0 {
		c.Writer.Header().Set("X-RateLimit-Global-Remaining", fmt.Sprintf("%d", global))
	}
	if ip >= 0 {
		c.Writer.Header().Set("X-RateLimit-IP-Remaining", fmt.Sprintf("%d", ip))
	}
	if key >= 0 {
		c.Writer.Header().Set("X-RateLimit-Key-Remaining", fmt.Sprintf("%d", key))
	}
}

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		var user *UserInfo
		var err error

		apiKey := c.GetHeader("X-API-Key")
		if apiKey != "" {
			user, err = validateAPIKey(apiKey)
			if err != nil {
				traceID := c.GetString("trace_id")
				c.JSON(http.StatusUnauthorized, common.ErrorResponse(common.ErrUnauthorized, traceID, 0))
				c.Abort()
				return
			}
		} else {
			authHeader := c.GetHeader("Authorization")
			if authHeader == "" {
				traceID := c.GetString("trace_id")
				c.JSON(http.StatusUnauthorized, common.ErrorResponse(common.ErrUnauthorized, traceID, 0))
				c.Abort()
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				traceID := c.GetString("trace_id")
				c.JSON(http.StatusUnauthorized, common.ErrorResponse(common.ErrUnauthorized, traceID, 0))
				c.Abort()
				return
			}

			user, err = validateJWT(parts[1])
			if err != nil {
				traceID := c.GetString("trace_id")
				c.JSON(http.StatusUnauthorized, common.ErrorResponse(common.ErrUnauthorized, traceID, 0))
				c.Abort()
				return
			}
		}

		ctx := context.WithValue(c.Request.Context(), UserContextKey, user)
		c.Request = c.Request.WithContext(ctx)
		c.Set("user", user)

		c.Next()
	}
}

func RoleRequired(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, exists := c.Get("user")
		if !exists {
			traceID := c.GetString("trace_id")
			c.JSON(http.StatusUnauthorized, common.ErrorResponse(common.ErrUnauthorized, traceID, 0))
			c.Abort()
			return
		}

		userInfo := user.(*UserInfo)
		hasRole := false
		for _, role := range roles {
			if userInfo.Role == role {
				hasRole = true
				break
			}
		}

		if !hasRole {
			traceID := c.GetString("trace_id")
			c.JSON(http.StatusForbidden, common.ErrorResponse(common.ErrForbidden, traceID, 0))
			c.Abort()
			return
		}

		c.Next()
	}
}

func validateAPIKey(apiKey string) (*UserInfo, error) {
	for _, key := range config.Get().Auth.APIKeys {
		if key.Key == apiKey {
			return &UserInfo{
				UserID:   key.Name,
				Username: key.Name,
				Role:     key.Role,
				APIKey:   apiKey,
			}, nil
		}
	}
	return nil, common.ErrUnauthorized
}

func validateJWT(tokenString string) (*UserInfo, error) {
	secret := []byte(config.Get().Auth.JWTSecret)

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		if exp, ok := claims["exp"].(float64); ok {
			if time.Unix(int64(exp), 0).Before(time.Now()) {
				return nil, fmt.Errorf("token expired")
			}
		}

		userID := ""
		username := ""
		role := "user"

		if id, ok := claims["user_id"].(string); ok {
			userID = id
		}
		if name, ok := claims["username"].(string); ok {
			username = name
		}
		if r, ok := claims["role"].(string); ok {
			role = r
		}

		return &UserInfo{
			UserID:   userID,
			Username: username,
			Role:     role,
		}, nil
	}

	return nil, fmt.Errorf("invalid token")
}

func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				traceID := c.GetString("trace_id")
				logger.Errorf("panic recovered: %v, trace_id: %s", err, traceID)
				c.JSON(http.StatusInternalServerError, common.ErrorResponseWithCode(
					common.CodeInternalError, "internal server error", traceID, 0,
				))
				c.Abort()
			}
		}()
		c.Next()
	}
}

func GetCurrentUser(c *gin.Context) *UserInfo {
	user, exists := c.Get("user")
	if !exists {
		return nil
	}
	return user.(*UserInfo)
}

func GetTraceID(c *gin.Context) string {
	traceID, exists := c.Get("trace_id")
	if !exists {
		return ""
	}
	return traceID.(string)
}
