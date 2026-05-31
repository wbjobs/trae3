export default function rateLimit(options = {}) {
  const maxRequests = options.maxRequests || 120
  const burstCapacity = options.burstCapacity || 20
  const windowMs = options.windowMs || 60000
  const refillRate = maxRequests / windowMs

  const buckets = new Map()

  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [ip, bucket] of buckets) {
      if (now - bucket.lastRefill > windowMs * 2) {
        buckets.delete(ip)
      }
    }
  }, windowMs)

  if (cleanupInterval.unref) {
    cleanupInterval.unref()
  }

  function getBucket(ip) {
    const now = Date.now()
    let bucket = buckets.get(ip)

    if (!bucket) {
      bucket = {
        tokens: burstCapacity,
        lastRefill: now
      }
      buckets.set(ip, bucket)
      return bucket
    }

    const elapsed = now - bucket.lastRefill
    const tokensToAdd = elapsed * refillRate
    bucket.tokens = Math.min(burstCapacity, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now

    return bucket
  }

  return async (ctx, next) => {
    const ip = ctx.ip
    const bucket = getBucket(ip)

    const remaining = Math.floor(bucket.tokens)
    const resetTime = Math.ceil(bucket.lastRefill / 1000) + Math.ceil(windowMs / 1000)

    ctx.set('X-RateLimit-Limit', String(maxRequests))
    ctx.set('X-RateLimit-Remaining', String(Math.max(0, remaining - 1)))
    ctx.set('X-RateLimit-Reset', String(resetTime))

    if (bucket.tokens < 1) {
      ctx.status = 429
      ctx.body = {
        code: 429,
        message: '请求过于频繁，请稍后重试',
        data: null,
        traceId: ctx.traceId,
        timestamp: Date.now()
      }
      return
    }

    bucket.tokens -= 1

    await next()
  }
}
