const jwt = require('jsonwebtoken');
const { User, Role } = require('../models/base');

const SECRET_KEY = 'chemical-secret-key';

async function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录，请先登录' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    
    const user = await User.findByPk(decoded.id);
    let role = null;
    if (user && user.roleId) {
      role = await Role.findByPk(user.roleId);
    }

    if (!user || user.status !== 1) {
      return res.status(401).json({ code: 401, message: '用户不存在或已被禁用' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      realName: user.realName,
      roleId: user.roleId,
      roleCode: role ? role.roleCode : null,
      permissions: role ? role.permissions : []
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
    }
    return res.status(401).json({ code: 401, message: '登录无效，请重新登录' });
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    
    const user = await User.findByPk(decoded.id, {
      include: [{
        model: Role,
        as: 'role',
        attributes: ['id', 'roleCode', 'roleName', 'permissions']
      }]
    });

    if (!user || user.status !== 1) {
      req.user = null;
      return next();
    }

    req.user = {
      id: user.id,
      username: user.username,
      realName: user.realName,
      roleId: user.roleId,
      roleCode: user.role ? user.role.roleCode : null,
      permissions: user.role ? user.role.permissions : []
    };

    next();
  } catch (error) {
    req.user = null;
    next();
  }
}

module.exports = {
  auth,
  optionalAuth,
  SECRET_KEY
};
