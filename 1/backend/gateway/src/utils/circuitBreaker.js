class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5
    this.resetTimeout = options.resetTimeout || 30000
    this.halfOpenMax = options.halfOpenMax || 1
    this.failures = new Map()
    this.states = new Map()
    this.halfOpenAttempts = new Map()
  }

  getState(serviceName) {
    if (!this.states.has(serviceName)) {
      this.states.set(serviceName, 'closed')
    }
    return this.states.get(serviceName)
  }

  recordSuccess(serviceName) {
    this.failures.delete(serviceName)
    this.states.set(serviceName, 'closed')
    this.halfOpenAttempts.delete(serviceName)
  }

  recordFailure(serviceName) {
    const count = (this.failures.get(serviceName) || 0) + 1
    this.failures.set(serviceName, count)

    if (count >= this.failureThreshold) {
      this.states.set(serviceName, 'open')
      setTimeout(() => {
        this.states.set(serviceName, 'half-open')
        this.halfOpenAttempts.set(serviceName, 0)
      }, this.resetTimeout)
    }
  }

  canRequest(serviceName) {
    const state = this.getState(serviceName)

    if (state === 'closed') return true
    if (state === 'open') return false

    if (state === 'half-open') {
      const attempts = this.halfOpenAttempts.get(serviceName) || 0
      if (attempts < this.halfOpenMax) {
        this.halfOpenAttempts.set(serviceName, attempts + 1)
        return true
      }
      return false
    }

    return false
  }

  getStatus(serviceName) {
    return {
      state: this.getState(serviceName),
      failures: this.failures.get(serviceName) || 0,
      canRequest: this.canRequest(serviceName)
    }
  }
}

export default new CircuitBreaker()
