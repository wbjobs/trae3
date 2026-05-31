import { useRef, useCallback } from 'react'

interface ProcessedDataPoint {
  stationId: string
  timestamp: string
  values: Record<string, number | null>
}

export function useDataWorker() {
  const workerRef = useRef<Worker | null>(null)

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/dataWorker.ts', import.meta.url),
        { type: 'module' }
      )
    }
    return workerRef.current
  }, [])

  const process = useCallback(
    (
      data: Array<{
        stationId: string
        timestamp: string
        values: Record<string, number | null>
      }>
    ): Promise<ProcessedDataPoint[]> => {
      return new Promise((resolve, reject) => {
        const worker = getWorker()

        const handleMessage = (e: MessageEvent) => {
          if (e.data.type === 'processQueryData') {
            worker.removeEventListener('message', handleMessage)
            worker.removeEventListener('error', handleError)
            resolve(e.data.data)
          }
        }

        const handleError = (err: ErrorEvent) => {
          worker.removeEventListener('message', handleMessage)
          worker.removeEventListener('error', handleError)
          reject(err)
        }

        worker.addEventListener('message', handleMessage)
        worker.addEventListener('error', handleError)
        worker.postMessage({ type: 'processQueryData', data })
      })
    },
    [getWorker]
  )

  return { process }
}
