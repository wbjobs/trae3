import React from 'react'
import { Provider } from 'react-redux'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { store } from './store'
import AppRouter from './router'

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <ConfigProvider locale={zhCN}>
        <AntApp>
          <AppRouter />
        </AntApp>
      </ConfigProvider>
    </Provider>
  )
}

export default App
