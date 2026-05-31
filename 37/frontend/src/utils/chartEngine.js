import * as echarts from 'echarts'

class ChartInstance {
  constructor(container, options = {}) {
    this.container = container
    this.options = options
    this.chart = null
    this.isRendering = false
    this.pendingOptions = null
    this.animationFrameId = null
    this.lastUpdateTime = 0
    this.updateThrottleMs = options.throttleMs || 16
    this.resizeObserver = null
  }

  init() {
    if (!this.container) return

    this.chart = echarts.init(this.container, null, {
      renderer: 'canvas',
      useDirtyRect: true,
      width: 'auto',
      height: 'auto'
    })

    this.chart.on('finished', () => {
      this.isRendering = false
    })

    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize()
    })
    this.resizeObserver.observe(this.container)

    return this
  }

  scheduleUpdate(options) {
    this.pendingOptions = options

    if (this.animationFrameId) {
      return
    }

    const now = performance.now()
    const timeSinceLastUpdate = now - this.lastUpdateTime

    if (timeSinceLastUpdate < this.updateThrottleMs) {
      this.animationFrameId = requestAnimationFrame(() => {
        this.animationFrameId = null
        this.performUpdate()
      })
    } else {
      this.performUpdate()
    }
  }

  performUpdate() {
    if (!this.chart || !this.pendingOptions) return

    this.isRendering = true
    this.lastUpdateTime = performance.now()

    try {
      this.chart.setOption(this.pendingOptions, {
        notMerge: false,
        lazyUpdate: true,
        silent: false
      })
    } catch (e) {
      console.error('Chart update error:', e)
    }

    this.pendingOptions = null
  }

  scheduleResize() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
    }

    this.animationFrameId = requestAnimationFrame(() => {
      this.animationFrameId = null
      if (this.chart) {
        this.chart.resize({
          animation: {
            duration: 0
          }
        })
      }
    })
  }

  dispatchAction(action) {
    if (this.chart) {
      this.chart.dispatchAction(action)
    }
  }

  on(event, handler) {
    if (this.chart) {
      this.chart.on(event, handler)
    }
  }

  off(event, handler) {
    if (this.chart) {
      this.chart.off(event, handler)
    }
  }

  getOption() {
    return this.chart?.getOption() || null
  }

  dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }

    if (this.chart) {
      this.chart.dispose()
      this.chart = null
    }

    this.container = null
    this.pendingOptions = null
  }
}

class ChartPool {
  constructor(maxSize = 10) {
    this.pool = new Map()
    this.maxSize = maxSize
    this.lruOrder = []
  }

  acquire(key, container, options) {
    if (this.pool.has(key)) {
      const instance = this.pool.get(key)
      this.touch(key)
      return instance
    }

    if (this.pool.size >= this.maxSize) {
      this.evict()
    }

    const instance = new ChartInstance(container, options).init()
    this.pool.set(key, instance)
    this.lruOrder.unshift(key)

    return instance
  }

  release(key) {
    const instance = this.pool.get(key)
    if (instance) {
      instance.dispose()
      this.pool.delete(key)
      const index = this.lruOrder.indexOf(key)
      if (index > -1) {
        this.lruOrder.splice(index, 1)
      }
    }
  }

  touch(key) {
    const index = this.lruOrder.indexOf(key)
    if (index > -1) {
      this.lruOrder.splice(index, 1)
      this.lruOrder.unshift(key)
    }
  }

  evict() {
    if (this.lruOrder.length > 0) {
      const oldestKey = this.lruOrder.pop()
      this.release(oldestKey)
    }
  }

  get(key) {
    return this.pool.get(key)
  }

  clear() {
    for (const key of Array.from(this.pool.keys())) {
      this.release(key)
    }
  }

  size() {
    return this.pool.size
  }
}

class VirtualChartRenderer {
  constructor(container, options = {}) {
    this.container = container
    this.options = {
      itemHeight: 300,
      overscan: 2,
      ...options
    }

    this.chartPool = new ChartPool(5)
    this.items = []
    this.scrollTop = 0
    this.visibleRange = { start: 0, end: 0 }
    this.renderedCharts = new Map()

    this.scrollContainer = null
    this.contentContainer = null

    this.init()
  }

  init() {
    this.container.style.overflow = 'auto'
    this.container.style.position = 'relative'

    this.scrollContainer = document.createElement('div')
    this.scrollContainer.style.position = 'relative'
    this.container.appendChild(this.scrollContainer)

    this.contentContainer = document.createElement('div')
    this.contentContainer.style.position = 'relative'
    this.scrollContainer.appendChild(this.contentContainer)

    this.container.addEventListener('scroll', this.handleScroll.bind(this))
    window.addEventListener('resize', this.handleResize.bind(this))
  }

  setItems(items) {
    this.items = items
    this.updateTotalHeight()
    this.updateVisibleRange()
    this.renderVisibleCharts()
  }

  updateTotalHeight() {
    const totalHeight = this.items.length * this.options.itemHeight
    this.contentContainer.style.height = `${totalHeight}px`
    this.scrollContainer.style.height = `${totalHeight}px`
  }

  handleScroll() {
    this.scrollTop = this.container.scrollTop
    this.updateVisibleRange()
    this.renderVisibleCharts()
  }

  handleResize() {
    this.updateVisibleRange()
    this.renderVisibleCharts()
  }

  updateVisibleRange() {
    const viewportHeight = this.container.clientHeight
    const itemHeight = this.options.itemHeight
    const overscan = this.options.overscan

    const startIdx = Math.max(0, Math.floor(this.scrollTop / itemHeight) - overscan)
    const endIdx = Math.min(
      this.items.length,
      Math.ceil((this.scrollTop + viewportHeight) / itemHeight) + overscan
    )

    this.visibleRange = { start: startIdx, end: endIdx }
  }

  renderVisibleCharts() {
    const { start, end } = this.visibleRange

    for (let i = start; i < end; i++) {
      if (i >= this.items.length) break

      const item = this.items[i]
      const chartKey = `chart_${item.id || i}`

      if (!this.renderedCharts.has(chartKey)) {
        this.createChartElement(chartKey, item, i)
      }
    }

    for (const [key, element] of this.renderedCharts) {
      const idx = parseInt(key.split('_')[1])
      if (idx < start || idx >= end) {
        this.removeChartElement(key)
      }
    }
  }

  createChartElement(key, item, index) {
    const wrapper = document.createElement('div')
    wrapper.style.position = 'absolute'
    wrapper.style.top = `${index * this.options.itemHeight}px`
    wrapper.style.left = '0'
    wrapper.style.right = '0'
    wrapper.style.height = `${this.options.itemHeight}px`
    wrapper.style.marginBottom = '16px'
    wrapper.dataset.chartKey = key

    const title = document.createElement('div')
    title.style.padding = '8px 16px'
    title.style.fontWeight = '600'
    title.style.borderBottom = '1px solid #f0f0f0'
    title.textContent = item.title || `图表 ${index + 1}`
    wrapper.appendChild(title)

    const chartContainer = document.createElement('div')
    chartContainer.style.height = 'calc(100% - 40px)'
    chartContainer.style.padding = '8px'
    wrapper.appendChild(chartContainer)

    this.contentContainer.appendChild(wrapper)

    const chartInstance = this.chartPool.acquire(key, chartContainer)
    chartInstance.scheduleUpdate(item.chartOption)

    if (item.onClick) {
      chartInstance.on('click', item.onClick)
    }

    this.renderedCharts.set(key, { wrapper, chartInstance })
  }

  removeChartElement(key) {
    const rendered = this.renderedCharts.get(key)
    if (rendered) {
      rendered.wrapper.remove()
      this.chartPool.release(key)
      this.renderedCharts.delete(key)
    }
  }

  updateChart(key, options) {
    const chartInstance = this.chartPool.get(key)
    if (chartInstance) {
      chartInstance.scheduleUpdate(options)
    }
  }

  dispose() {
    this.container.removeEventListener('scroll', this.handleScroll)
    window.removeEventListener('resize', this.handleResize)

    for (const key of Array.from(this.renderedCharts.keys())) {
      this.removeChartElement(key)
    }

    this.chartPool.clear()

    if (this.scrollContainer) {
      this.scrollContainer.remove()
    }
  }
}

const globalChartPool = new ChartPool(8)

function createHighPerformanceChart(container, options = {}) {
  const key = options.key || `chart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  return globalChartPool.acquire(key, container, options)
}

function disposeChart(key) {
  globalChartPool.release(key)
}

export {
  ChartInstance,
  ChartPool,
  VirtualChartRenderer,
  globalChartPool,
  createHighPerformanceChart,
  disposeChart
}

export default createHighPerformanceChart
