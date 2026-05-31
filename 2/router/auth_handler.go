package router

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/config"
	"industrial-protocol-gateway/logger"
)

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expires_in"`
	TokenType string `json:"token_type"`
	User      *UserInfo `json:"user"`
}

func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		traceID := GetTraceID(c)
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, 0))
		return
	}

	if req.Username != "admin" || req.Password != "admin123" {
		traceID := GetTraceID(c)
		c.JSON(http.StatusUnauthorized, common.ErrorResponse(common.ErrUnauthorized, traceID, 0))
		return
	}

	expireSeconds := config.Get().Auth.JWTExpire
	expirationTime := time.Now().Add(time.Duration(expireSeconds) * time.Second)

	claims := jwt.MapClaims{
		"user_id":  "1",
		"username": req.Username,
		"role":     "admin",
		"exp":      expirationTime.Unix(),
		"iat":      time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	secret := []byte(config.Get().Auth.JWTSecret)
	tokenString, err := token.SignedString(secret)
	if err != nil {
		traceID := GetTraceID(c)
		c.JSON(http.StatusInternalServerError, common.ErrorResponseWithCode(
			common.CodeInternalError, "generate token failed", traceID, 0,
		))
		return
	}

	user := &UserInfo{
		UserID:   "1",
		Username: req.Username,
		Role:     "admin",
	}

	logger.LogAudit(&logger.AuditLog{
		UserID:    user.UserID,
		Action:    "login",
		Resource:  "auth",
		IP:        getClientIP(c),
		Timestamp: time.Now(),
		Details: map[string]interface{}{
			"username": req.Username,
		},
	})

	start := c.GetTime("start_time")
	elapsed := time.Since(start).Milliseconds()

	c.JSON(http.StatusOK, common.SuccessResponse(&LoginResponse{
		Token:     tokenString,
		ExpiresIn: expireSeconds,
		TokenType: "Bearer",
		User:      user,
	}, GetTraceID(c), elapsed))
}

func Logout(c *gin.Context) {
	user := GetCurrentUser(c)
	if user != nil {
		logger.LogAudit(&logger.AuditLog{
			UserID:    user.UserID,
			Action:    "logout",
			Resource:  "auth",
			IP:        getClientIP(c),
			Timestamp: time.Now(),
		})
	}

	start := c.GetTime("start_time")
	elapsed := time.Since(start).Milliseconds()

	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"message": "logout successful",
	}, GetTraceID(c), elapsed))
}

func GetCurrentUserInfo(c *gin.Context) {
	user := GetCurrentUser(c)
	start := c.GetTime("start_time")
	elapsed := time.Since(start).Milliseconds()

	c.JSON(http.StatusOK, common.SuccessResponse(user, GetTraceID(c), elapsed))
}

func RefreshToken(c *gin.Context) {
	user := GetCurrentUser(c)
	expireSeconds := config.Get().Auth.JWTExpire
	expirationTime := time.Now().Add(time.Duration(expireSeconds) * time.Second)

	claims := jwt.MapClaims{
		"user_id":  user.UserID,
		"username": user.Username,
		"role":     user.Role,
		"exp":      expirationTime.Unix(),
		"iat":      time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	secret := []byte(config.Get().Auth.JWTSecret)
	tokenString, err := token.SignedString(secret)
	if err != nil {
		traceID := GetTraceID(c)
		c.JSON(http.StatusInternalServerError, common.ErrorResponseWithCode(
			common.CodeInternalError, "generate token failed", traceID, 0,
		))
		return
	}

	start := c.GetTime("start_time")
	elapsed := time.Since(start).Milliseconds()

	c.JSON(http.StatusOK, common.SuccessResponse(&LoginResponse{
		Token:     tokenString,
		ExpiresIn: expireSeconds,
		TokenType: "Bearer",
		User:      user,
	}, GetTraceID(c), elapsed))
}

func SetupAuthRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	{
		auth.POST("/login", Login)
		auth.POST("/logout", AuthRequired(), Logout)
		auth.GET("/me", AuthRequired(), GetCurrentUserInfo)
		auth.POST("/refresh", AuthRequired(), RefreshToken)
	}
}
