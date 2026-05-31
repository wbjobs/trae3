export class DataSampler {
  static LTTB(data, threshold) {
    if (!data || data.length <= threshold) {
      return data
    }

    const sampled = []
    const bucketSize = (data.length - 2) / (threshold - 2)
    let a = 0

    sampled.push(data[a])

    for (let i = 0; i < threshold - 2; i++) {
      const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1
      const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1
      const avgRange = Math.min(avgRangeEnd, data.length) - avgRangeStart

      let avgX = 0
      let avgY = 0
      for (let j = avgRangeStart; j < avgRangeEnd; j++) {
        avgX += j
        avgY += data[j]
      }
      avgX /= avgRange
      avgY /= avgRange

      const rangeStart = Math.floor(i * bucketSize) + 1
      const rangeEnd = Math.floor((i + 1) * bucketSize) + 1

      let maxArea = -1
      let nextA = a

      for (let j = rangeStart; j < rangeEnd; j++) {
        const area = Math.abs(
          (data[a] - avgY) * (j - avgX) - (a - avgX) * (data[j] - avgY)
        ) * 0.5
        if (area > maxArea) {
          maxArea = area
          nextA = j
        }
      }

      sampled.push(data[nextA])
      a = nextA
    }

    sampled.push(data[data.length - 1])
    return sampled
  }

  static minMaxSampling(data, threshold) {
    if (!data || data.length <= threshold) {
      return data
    }

    const sampled = []
    const bucketSize = Math.ceil(data.length / threshold)

    for (let i = 0; i < data.length; i += bucketSize) {
      const bucket = data.slice(i, i + bucketSize)
      if (bucket.length === 1) {
        sampled.push(bucket[0])
      } else {
        let minIndex = 0
        let maxIndex = 0
        for (let j = 1; j < bucket.length; j++) {
          if (bucket[j] < bucket[minIndex]) minIndex = j
          if (bucket[j] > bucket[maxIndex]) maxIndex = j
        }
        if (minIndex < maxIndex) {
          sampled.push(bucket[minIndex])
          sampled.push(bucket[maxIndex])
        } else {
          sampled.push(bucket[maxIndex])
          sampled.push(bucket[minIndex])
        }
      }
    }

    return sampled
  }

  static downsampleMultiAxis(yData, xData, maxPoints = 1000) {
    if (!yData || !xData || xData.length <= maxPoints) {
      return { yData, xData, originalCount: xData.length, sampledCount: xData.length }
    }

    const originalCount = xData.length
    const axes = Object.keys(yData)
    const sampledIndices = this.LTTB(
      Array.from({ length: xData.length }, (_, i) => i),
      maxPoints
    )

    const newXData = sampledIndices.map(i => xData[i])
    const newYData = {}

    axes.forEach(axis => {
      newYData[axis] = sampledIndices.map(i => yData[axis][i])
    })

    return {
      yData: newYData,
      xData: newXData,
      originalCount,
      sampledCount: newXData.length,
      indices: sampledIndices
    }
  }
}

export class DataCache {
  constructor(maxSize = 50) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.order = []
  }

  _getKey(params) {
    return JSON.stringify(params)
  }

  get(params) {
    const key = this._getKey(params)
    const entry = this.cache.get(key)
    if (entry) {
      const index = this.order.indexOf(key)
      if (index > -1) {
        this.order.splice(index, 1)
        this.order.unshift(key)
      }
      return entry.data
    }
    return null
  }

  set(params, data) {
    const key = this._getKey(params)

    if (this.cache.has(key)) {
      const index = this.order.indexOf(key)
      if (index > -1) {
        this.order.splice(index, 1)
      }
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.order.pop()
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, { data, timestamp: Date.now() })
    this.order.unshift(key)
  }

  has(params) {
    const key = this._getKey(params)
    return this.cache.has(key)
  }

  clear() {
    this.cache.clear()
    this.order = []
  }
}

export const vibrationDataCache = new DataCache(30)
