import React from 'react'
import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'
import styles from './AuthLayout.module.css'

const { Content } = Layout

const AuthLayout: React.FC = () => {
  return (
    <Layout className={styles.authLayout}>
      <div className={styles.background} />
      <Content className={styles.content}>
        <div className={styles.loginBox}>
          <div className={styles.logo}>
            <h1>标本管理系统</h1>
            <p>Specimen Management System</p>
          </div>
          <Outlet />
        </div>
      </Content>
    </Layout>
  )
}

export default AuthLayout
