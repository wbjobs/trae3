const express = require('express');
const bcrypt = require('bcryptjs');
const { Op } = require('../config/database');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { User, Role, Permission } = require('../models/base');

const router = express.Router();

router.get('/users', auth, requirePermission('user:manage'), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword } = req.query;

    const where = {};
    if (keyword) {
      where[Op.or] = [
        { username: { [Op.like]: `%${keyword}%` } },
        { realName: { [Op.like]: `%${keyword}%` } },
        { department: { [Op.like]: `%${keyword}%` } }
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      include: [{
        model: Role,
        as: 'role',
        attributes: ['id', 'roleName', 'roleCode']
      }],
      attributes: { exclude: ['password'] },
      order: [['id', 'DESC']],
      limit: Number(pageSize),
      offset: (Number(page) - 1) * Number(pageSize)
    });

    res.json({
      code: 200,
      message: '获取成功',
      data: {
        list: rowsWithRole,
        total: count,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(count / Number(pageSize))
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ code: 500, message: '获取用户列表失败，请稍后重试' });
  }
});

router.post('/users', auth, requirePermission('user:manage'), async (req, res) => {
  try {
    const { username, password, realName, department, phone, roleId, status = 1 } = req.body;

    if (!username || !password || !realName || !roleId) {
      return res.status(400).json({ code: 400, message: '用户名、密码、真实姓名、角色ID不能为空' });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ code: 400, message: '用户名已存在' });
    }

    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(400).json({ code: 400, message: '角色不存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashedPassword,
      realName,
      department,
      phone,
      roleId,
      status
    });

    const userWithRole = await User.findByPk(user.id, {
      include: [{
        model: Role,
        as: 'role',
        attributes: ['id', 'roleName', 'roleCode']
      }],
      attributes: { exclude: ['password'] }
    });

    res.json({
      code: 200,
      message: '创建成功',
      data: userWithRole
    });
  } catch (error) {
    console.error('创建用户失败:', error);
    res.status(500).json({ code: 500, message: '创建用户失败，请稍后重试' });
  }
});

router.put('/users/:id', auth, requirePermission('user:manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password, realName, department, phone, roleId, status } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    if (roleId) {
      const role = await Role.findByPk(roleId);
      if (!role) {
        return res.status(400).json({ code: 400, message: '角色不存在' });
      }
    }

    const updateData = { realName, department, phone, roleId, status };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await user.update(updateData);

    const updatedUser = await User.findByPk(id, {
      include: [{
        model: Role,
        as: 'role',
        attributes: ['id', 'roleName', 'roleCode']
      }],
      attributes: { exclude: ['password'] }
    });

    res.json({
      code: 200,
      message: '更新成功',
      data: updatedUser
    });
  } catch (error) {
    console.error('更新用户失败:', error);
    res.status(500).json({ code: 500, message: '更新用户失败，请稍后重试' });
  }
});

router.delete('/users/:id', auth, requirePermission('user:manage'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    if (user.username === 'admin') {
      return res.status(400).json({ code: 400, message: '不能删除管理员账号' });
    }

    await user.destroy();

    res.json({
      code: 200,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({ code: 500, message: '删除用户失败，请稍后重试' });
  }
});

router.get('/roles', auth, requirePermission('role:manage'), async (req, res) => {
  try {
    const roles = await Role.findAll({
      order: [['id', 'ASC']]
    });

    res.json({
      code: 200,
      message: '获取成功',
      data: roles
    });
  } catch (error) {
    console.error('获取角色列表失败:', error);
    res.status(500).json({ code: 500, message: '获取角色列表失败，请稍后重试' });
  }
});

router.post('/roles', auth, requirePermission('role:manage'), async (req, res) => {
  try {
    const { roleName, roleCode, description, permissions = [] } = req.body;

    if (!roleName || !roleCode) {
      return res.status(400).json({ code: 400, message: '角色名称、角色编码不能为空' });
    }

    const existingRole = await Role.findOne({
      where: { [Op.or]: [{ roleName }, { roleCode }] }
    });
    if (existingRole) {
      return res.status(400).json({ code: 400, message: '角色名称或角色编码已存在' });
    }

    const role = await Role.create({
      roleName,
      roleCode,
      description,
      permissions
    });

    res.json({
      code: 200,
      message: '创建成功',
      data: role
    });
  } catch (error) {
    console.error('创建角色失败:', error);
    res.status(500).json({ code: 500, message: '创建角色失败，请稍后重试' });
  }
});

router.put('/roles/:id', auth, requirePermission('role:manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { roleName, roleCode, description, permissions } = req.body;

    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ code: 404, message: '角色不存在' });
    }

    if (roleName || roleCode) {
      const existingRole = await Role.findOne({
        where: {
          id: { [Op.ne]: id },
          [Op.or]: [{ roleName: roleName || role.roleName }, { roleCode: roleCode || role.roleCode }]
        }
      });
      if (existingRole) {
        return res.status(400).json({ code: 400, message: '角色名称或角色编码已存在' });
      }
    }

    await role.update({ roleName, roleCode, description, permissions });

    res.json({
      code: 200,
      message: '更新成功',
      data: role
    });
  } catch (error) {
    console.error('更新角色失败:', error);
    res.status(500).json({ code: 500, message: '更新角色失败，请稍后重试' });
  }
});

router.delete('/roles/:id', auth, requirePermission('role:manage'), async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ code: 404, message: '角色不存在' });
    }

    const usersWithRole = await User.count({ where: { roleId: id } });
    if (usersWithRole > 0) {
      return res.status(400).json({ code: 400, message: '该角色下还有用户，不能删除' });
    }

    await role.destroy();

    res.json({
      code: 200,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除角色失败:', error);
    res.status(500).json({ code: 500, message: '删除角色失败，请稍后重试' });
  }
});

router.put('/users/:id/reset-password', auth, requirePermission('user:manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password = '123456' } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await user.update({ password: hashedPassword });

    res.json({
      code: 200,
      message: '密码重置成功'
    });
  } catch (error) {
    console.error('重置密码失败:', error);
    res.status(500).json({ code: 500, message: '重置密码失败，请稍后重试' });
  }
});

router.put('/roles/:id/permissions', auth, requirePermission('role:manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ code: 404, message: '角色不存在' });
    }

    await role.update({ permissions });

    res.json({
      code: 200,
      message: '权限分配成功',
      data: role
    });
  } catch (error) {
    console.error('分配权限失败:', error);
    res.status(500).json({ code: 500, message: '分配权限失败，请稍后重试' });
  }
});

router.get('/permissions', auth, requirePermission('role:manage'), async (req, res) => {
  try {
    const permissions = await Permission.findAll({
      order: [['module', 'ASC'], ['id', 'ASC']]
    });

    res.json({
      code: 200,
      message: '获取成功',
      data: permissions
    });
  } catch (error) {
    console.error('获取权限列表失败:', error);
    res.status(500).json({ code: 500, message: '获取权限列表失败，请稍后重试' });
  }
});

module.exports = router;
