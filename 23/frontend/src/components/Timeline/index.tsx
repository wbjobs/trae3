import React from 'react'
import { Timeline as AntTimeline, Tag } from 'antd'
import { formatDate } from '@/utils'
import { TraceabilityRecord } from '@/types'
import styles from './index.module.css'

interface TimelineProps {
  records: TraceabilityRecord[]
}

const operationTypeMap: Record<number, { color: string; label: string }> = {
  1: { color: 'blue', label: '创建' },
  2: { color: 'gold', label: '更新' },
  3: { color: 'cyan', label: '提交' },
  4: { color: 'green', label: '审核' },
  5: { color: 'red', label: '驳回' },
  6: { color: 'purple', label: '归档' },
  7: { color: 'orange', label: '导出' },
  8: { color: 'geekblue', label: '导入' }
}

const Timeline: React.FC<TimelineProps> = ({ records }) => {
  return (
    <div className={styles.timeline}>
      <AntTimeline mode="left">
        {records.map((record) => {
          const typeInfo = operationTypeMap[record.operationType] || {
            color: 'default',
            label: record.operationTypeName || record.operationType
          }
          return (
            <AntTimeline.Item
              key={record.id}
              color={typeInfo.color}
              label={
                <div className={styles.time}>
                  {formatDate(record.operationTime || record.createTime)}
                </div>
              }
            >
              <div className={styles.item}>
                <div className={styles.header}>
                  <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
                  <span className={styles.operator}>{record.operatorName}</span>
                </div>
                <div className={styles.desc}>{record.remark || record.location || '无描述'}</div>
                {record.location && (
                  <div className={styles.location}>地点: {record.location}</div>
                )}
              </div>
            </AntTimeline.Item>
          )
        })}
      </AntTimeline>
    </div>
  )
}

export default Timeline
