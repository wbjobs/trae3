import React from 'react'
import { Breadcrumb, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import styles from './index.module.css'

interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumbs?: Array<{ title: string; path?: string }>
  showBack?: boolean
  extra?: React.ReactNode
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  showBack = false,
  extra
}) => {
  const navigate = useNavigate()

  const handleBack = () => {
    navigate(-1)
  }

  return (
    <div className={styles.header}>
      <div className={styles.left}>
        {showBack && (
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            className={styles.backBtn}
          />
        )}
        <div>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumb className={styles.breadcrumb}>
              {breadcrumbs.map((item, index) => (
                <Breadcrumb.Item key={index}>
                  {item.path ? (
                    <a onClick={() => navigate(item.path!)}>{item.title}</a>
                  ) : (
                    item.title
                  )}
                </Breadcrumb.Item>
              ))}
            </Breadcrumb>
          )}
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {extra && <div className={styles.right}>{extra}</div>}
    </div>
  )
}

export default PageHeader
