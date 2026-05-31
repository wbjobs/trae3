export default function requestBatch(options = {}) {
  const windowMs = options.windowMs || 50

  const pendingRequests = new Map()

  function generateKey(ctx) {
    return `${ctx.method}:${ctx.path}:${JSON.stringify(ctx.query)}`
  }

  return async (ctx, next) => {
    if (ctx.method !== 'GET') {
      return await next()
    }

    const key = generateKey(ctx)

    if (pendingRequests.has(key)) {
      await pendingRequests.get(key)
      return
    }

    const promise = next().finally(() => {
      setTimeout(() => {
        pendingRequests.delete(key)
      }, windowMs)
    })

    pendingRequests.set(key, promise)

    await promise
  }
}
