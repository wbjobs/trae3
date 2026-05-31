export default function timeoutMiddleware(ms = 30000) {
  return async (ctx, next) => {
    let timer = null

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('请求处理超时')
        err.status = 504
        err.code = 'REQUEST_TIMEOUT'
        reject(err)
      }, ms)
    })

    try {
      await Promise.race([
        next(),
        timeout
      ])
    } finally {
      clearTimeout(timer)
    }
  }
}
