const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Role } = require('../models/base');
const { auth } = require('../middleware/auth');
const { SECRET_KEY } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    const user = await User.findOne({
      where: { username }
    });

    let role = null;
    if (user && user.roleId) {
      role = await Role.findByPk(user.roleId);
    }

    if (!user) {
      return res.status(400).json({ code: 400, message: '用户名或密码错误' });
    }

    if (user.status !== 1) {
      return res.status(400).json({ code: 400, message: '用户已被禁用，请联系管理员' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(400).json({ code: 400, message: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      SECRET_KEY,
      { expiresIn: '7d' }
    );

    const userInfo = {
      id: user.id,
      username: user.username,
      realName: user.realName,
      department: user.department,
      phone: user.phone,
      roleId: user.roleId,
      roleCode: role ? role.roleCode : null,
      roleName: role ? role.roleName : null,
      permissions: role ? role.permissions : []
    };

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: userInfo
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ code: 500, message: '登录失败，请稍后重试' });
  }
});

router.post('/logout', auth, (req, res) => {
  res.json({
    code: 200,
    message: '登出成功'
  });
});

router.get('/info', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    let role = null;
    if (user && user.roleId) {
      role = await Role.findByPk(user.roleId);
    }

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    const userInfo = {
      id: user.id,
      username: user.username,
      realName: user.realName,
      department: user.department,
      phone: user.phone,
      roleId: user.roleId,
      roleCode: user.role ? user.role.roleCode : null,
      roleName: user.role ? user.role.roleName : null,
      permissions: user.role ? user.role.permissions : []
    };

    res.json({
      code: 200,
      message: '获取成功',
      data: userInfo
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ code: 500, message: '获取用户信息失败' });
  }
});

module.exports = router;
