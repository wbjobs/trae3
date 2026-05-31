import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import { HashRouter } from 'react-router-dom';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import App from './App';
import './styles/global.css';

const RootApp: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        },
        components: {
          Layout: {
            headerBg: '#001529',
            siderBg: '#001529'
          },
          Menu: {
            darkItemBg: '#001529',
            darkSubMenuItemBg: '#000c17'
          }
        }
      }}
    >
      <AntdApp>
        <HashRouter>
          <App />
        </HashRouter>
      </AntdApp>
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<RootApp />);
