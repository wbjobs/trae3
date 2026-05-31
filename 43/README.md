# 危化品线上申领系统

## 项目概述
危化品线上申领全流程管理系统，实现领用申请、逐级审批、台账查询、全流程溯源等核心功能。

## 技术架构
- **前端**: Vue 3 + Vite + Element Plus + Vue Router
- **后端**: Node.js + Express + Sequelize ORM
- **双数据库设计**:
  - `chemical_base.db` - 基础数据库（用户、角色、危化品基础信息、权限配置）
  - `chemical_flow.db` - 流转数据库（申请单、审批记录、溯源日志、操作记录）

## 功能模块

### 前端页面
1. **领用申请** - 危化品申领表单提交、状态跟踪
2. **台账查询** - 申请记录搜索、筛选、导出
3. **权限管理** - 用户管理、角色管理、权限分配

### 后端模块
1. **流程审批** - 逐级审批流程引擎、审批节点流转
2. **数据校验** - 申领数据合法性校验、库存校验、审批权限校验
3. **溯源记录** - 全流程操作日志、追溯链条记录

## 项目结构
```
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── config/         # 数据库配置
│   │   ├── models/         # 数据模型（基础库+流转库）
│   │   ├── modules/        # 业务模块
│   │   │   ├── approval/   # 流程审批模块
│   │   │   ├── validation/ # 数据校验模块
│   │   │   └── trace/      # 溯源记录模块
│   │   ├── middleware/     # 中间件
│   │   ├── routes/         # 路由
│   │   └── app.js          # 入口文件
│   └── package.json
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── api/            # API接口
│   │   ├── layouts/        # 布局组件
│   │   ├── views/          # 页面组件
│   │   ├── router/         # 路由配置
│   │   ├── App.vue
│   │   └── main.js
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## 快速开始

### 启动后端
```bash
cd backend
npm install
npm start
```
后端服务运行在 http://localhost:3002

### 启动前端
```bash
cd frontend
npm install
npm run dev
```
前端服务运行在 http://localhost:5173

## 审批流程
申请人提交 → 部门负责人审批 → 安全管理员审核 → 仓库管理员发放 → 完成

## 默认账号
- 管理员: admin / 123456
- 申请人: user / 123456
- 审批人: approver / 123456
