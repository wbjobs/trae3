export default function responseCache(options = {}) {
  const ttl = options.ttl || 10000
  const maxSize = options.maxSize || 500

  const cache = new Map()
  let hits = 0
  let misses = 0

  function generateKey(ctx) {
    return `${ctx.method}:${ctx.path}:${JSON.stringify(ctx.query)}`
  }

  const api = {
    clearCache() {
      cache.clear()
    },

    invalidatePath(path) {
      for (const [key] of cache) {
        if (key.includes(`:${path}:`)) {
          cache.delete(key)
        }
      }
    },

    get stats() {
      return { hits, misses, size: cache.size }
    }
  }

  return async (ctx, next) => {
    ctx.state.cache = api

    if (ctx.method !== 'GET') {
      return await next()
    }

    const key = generateKey(ctx)
    const now = Date.now()
    const cached = cache.get(key)

    if (cached && cached.expireAt > now) {
      hits++
      ctx.set('X-Cache', 'HIT')
      ctx.status = cached.status
      ctx.body = cached.body
      for (const [header, value] of Object.entries(cached.headers)) {
        ctx.set(header, value)
      }
      return
    }

    if (cached) {
      cache.delete(key)
    }

    misses++

    await next()

    if (ctx.status >= 200 && ctx.status < 300) {
      if (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value
        cache.delete(oldestKey)
      }

      const headersToCache = {}
      const headersToKeep = ['X-Trace-Id']
      for (const header of headersToKeep) {
        if (ctx.response.headers[header.toLowerCase()]) {
          headersToCache[header] = ctx.response.headers[header.toLowerCase()]
        }
      }

      cache.set(key, {
        status: ctx.status,
        body: ctx.body,
        headers: headersToCache,
        expireAt: now + ttl
      })
    }

    ctx.set('X-Cache', 'MISS')
  }
}
