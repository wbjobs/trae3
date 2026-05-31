const express = require('express');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const approvalModule = require('../modules/approval');

const applicationsRouter = express.Router();
const approvalsRouter = express.Router();

function mapApplicationFields(app) {
  if (!app) return app;
  const result = { ...app };
  if (result.applyNo && !result.applicationNo) {
    result.applicationNo = result.applyNo;
  }
  return result;
}

function mapApplicationList(data) {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(mapApplicationFields);
  }
  if (data.list && Array.isArray(data.list)) {
    return {
      ...data,
      list: data.list.map(mapApplicationFields)
    };
  }
  return mapApplicationFields(data);
}

applicationsRouter.post('/', auth, requirePermission('apply:create'), async (req, res) => {
  try {
    const application = await approvalModule.createApplication(req.body, req.user, req);
    res.json({
      code: 200,
      message: '创建成功',
      data: mapApplicationFields(application)
    });
  } catch (error) {
    console.error('创建申请单失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

applicationsRouter.put('/:id/submit', auth, requirePermission('apply:create'), async (req, res) => {
  try {
    const application = await approvalModule.submitApplication(req.params.id, req.user, req);
    res.json({
      code: 200,
      message: '提交成功',
      data: mapApplicationFields(application)
    });
  } catch (error) {
    console.error('提交申请单失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

applicationsRouter.get('/', auth, requirePermission('apply:view'), async (req, res) => {
  try {
    const result = await approvalModule.getApplicationList(req.query, req.user, req);
    res.json({
      code: 200,
      message: '获取成功',
      data: mapApplicationList(result)
    });
  } catch (error) {
    console.error('获取申请单列表失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

applicationsRouter.get('/:id', auth, requirePermission('apply:view'), async (req, res) => {
  try {
    const result = await approvalModule.getApplicationDetail(req.params.id, req.user, req);
    res.json({
      code: 200,
      message: '获取成功',
      data: mapApplicationFields(result)
    });
  } catch (error) {
    console.error('获取申请单详情失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

applicationsRouter.put('/:id/cancel', auth, requirePermission('apply:create'), async (req, res) => {
  try {
    const application = await approvalModule.cancelApplication(req.params.id, req.user, req);
    res.json({
      code: 200,
      message: '取消成功',
      data: mapApplicationFields(application)
    });
  } catch (error) {
    console.error('取消申请单失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

approvalsRouter.get('/pending', auth, requirePermission('approval:do'), async (req, res) => {
  try {
    const result = await approvalModule.getApprovalList(req.user);
    res.json({
      code: 200,
      message: '获取成功',
      data: mapApplicationList(result)
    });
  } catch (error) {
    console.error('获取待审批列表失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

approvalsRouter.put('/:id/approve', auth, requirePermission('approval:do'), async (req, res) => {
  try {
    const application = await approvalModule.approveApplication(req.params.id, req.body, req.user, req);
    res.json({
      code: 200,
      message: '审批通过',
      data: mapApplicationFields(application)
    });
  } catch (error) {
    console.error('审批通过失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

approvalsRouter.put('/:id/reject', auth, requirePermission('approval:do'), async (req, res) => {
  try {
    const application = await approvalModule.rejectApplication(req.params.id, req.body, req.user, req);
    res.json({
      code: 200,
      message: '已驳回',
      data: mapApplicationFields(application)
    });
  } catch (error) {
    console.error('驳回失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

approvalsRouter.put('/:id/distribute', auth, requirePermission('approval:do'), async (req, res) => {
  try {
    const application = await approvalModule.distributeApplication(req.params.id, req.user, req);
    res.json({
      code: 200,
      message: '发放成功',
      data: mapApplicationFields(application)
    });
  } catch (error) {
    console.error('发放失败:', error);
    return res.status(400).json({ code: 400, message: error.message });
  }
});

module.exports = {
  applicationsRouter,
  approvalsRouter
};
