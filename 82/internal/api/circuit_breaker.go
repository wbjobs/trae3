package api

import (
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

type CircuitState int

const (
	CircuitClosed   CircuitState = iota
	CircuitOpen
	CircuitHalfOpen
)

type CircuitBreaker struct {
	mu              sync.Mutex
	state           CircuitState
	failures        int64
	successes       int64
	failureThreshold int64
	successThreshold int64
	timeout         time.Duration
	lastFailure     time.Time
}

func NewCircuitBreaker(failureThreshold, successThreshold int64, timeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		state:            CircuitClosed,
		failureThreshold: failureThreshold,
		successThreshold: successThreshold,
		timeout:          timeout,
	}
}

func (cb *CircuitBreaker) Allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case CircuitClosed:
		return true
	case CircuitOpen:
		if time.Since(cb.lastFailure) > cb.timeout {
			cb.state = CircuitHalfOpen
			cb.successes = 0
			return true
		}
		return false
	case CircuitHalfOpen:
		return true
	default:
		return true
	}
}

func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failures = 0
	if cb.state == CircuitHalfOpen {
		cb.successes++
		if cb.successes >= cb.successThreshold {
			cb.state = CircuitClosed
			cb.failures = 0
			cb.successes = 0
		}
	}
}

func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failures++
	cb.lastFailure = time.Now()
	if cb.state == CircuitHalfOpen {
		cb.state = CircuitOpen
		cb.successes = 0
	} else if cb.failures >= cb.failureThreshold {
		cb.state = CircuitOpen
	}
}

func (cb *CircuitBreaker) State() CircuitState {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.state
}

func CircuitBreakerMiddleware(cb *CircuitBreaker) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !cb.Allow() {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, Response{
				Code:    -3,
				Message: "circuit breaker is open",
			})
			return
		}

		c.Next()

		if c.Writer.Status() >= http.StatusInternalServerError {
			cb.RecordFailure()
		} else {
			cb.RecordSuccess()
		}
	}
}

type TokenBucketLimiter struct {
	tokens     float64
	maxTokens  float64
	rate       float64
	lastRefill time.Time
	mu         sync.Mutex
}

func NewTokenBucketLimiter(rate float64, maxTokens float64) *TokenBucketLimiter {
	return &TokenBucketLimiter{
		tokens:     maxTokens,
		maxTokens:  maxTokens,
		rate:       rate,
		lastRefill: time.Now(),
	}
}

func (tbl *TokenBucketLimiter) Allow() bool {
	tbl.mu.Lock()
	defer tbl.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(tbl.lastRefill).Seconds()
	tbl.tokens += elapsed * tbl.rate
	if tbl.tokens > tbl.maxTokens {
		tbl.tokens = tbl.maxTokens
	}
	tbl.lastRefill = now

	if tbl.tokens >= 1 {
		tbl.tokens--
		return true
	}
	return false
}

func RateLimitMiddleware(limiter *TokenBucketLimiter) gin.HandlerFunc {
	var rejected int64
	return func(c *gin.Context) {
		if !limiter.Allow() {
			atomic.AddInt64(&rejected, 1)
			c.AbortWithStatusJSON(http.StatusTooManyRequests, Response{
				Code:    -4,
				Message: "rate limit exceeded",
			})
			return
		}
		c.Next()
	}
}
